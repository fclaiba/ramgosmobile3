const fs = require('fs');

const path = 'src/contexts/AuthContext.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove createSessionMock completely
content = content.replace(/    \/\/ Helper to satisfy strict SessionRecord type\s+const createSessionMock[^}]+}\);\s+/g, '');

// 2. Fix the initial useEffect to not use _mockUser
content = content.replace(
/    \/\/ 1\. Initialize Session \(MOCKED\)[\s\S]+?    \}, \[\]\);/,
`    // 1. Initialize Session
    useEffect(() => {
        (async () => {
            try {
                const storedValue = await storage.getItem(CURRENT_SESSION_KEY);
                if (storedValue) {
                    let userId = storedValue;
                    if (storedValue.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(storedValue);
                            userId = parsed.userId;
                            await storage.setItem(CURRENT_SESSION_KEY, userId);
                        } catch (e) {}
                    }
                    if (userId) {
                        setState(prev => ({
                            ...prev,
                            session: { userId } as any,
                            status: 'loading',
                        }));
                    } else {
                        setState(prev => ({ ...prev, status: 'anonymous' }));
                    }
                } else {
                    setState(prev => ({ ...prev, status: 'anonymous' }));
                }
            } catch (e) {
                console.error("Failed to load session", e);
                setState(prev => ({ ...prev, status: 'anonymous' }));
            }
        })();
    }, []);`
);

// 3. Fix signUpWithEmail
content = content.replace(
/            const session = createSessionMock\(user\.id\);\s+await storage\.setItem\(CURRENT_SESSION_KEY, JSON\.stringify\(\{ \.\.\.session, _mockUser: user \}\)\);\s+setState\(prev => \(\{[\s\S]+?\}\)\);/,
`            await storage.setItem(CURRENT_SESSION_KEY, user.id);

            setState(prev => ({
                ...prev,
                status: 'authenticated',
                session: { userId: user.id } as any,
                user,
            }));`
);

// 4. Fix loginWithEmail
content = content.replace(
/            const session = createSessionMock\(user\.id\);\s+await storage\.setItem\(CURRENT_SESSION_KEY, JSON\.stringify\(\{ \.\.\.session, _mockUser: user \}\)\);\s+setState\(prev => \(\{[\s\S]+?\}\)\);/,
`            await storage.setItem(CURRENT_SESSION_KEY, user.id);

            setState(prev => ({
                ...prev,
                status: 'authenticated',
                user,
                session: { userId: user.id } as any,
                originalUser: null
            }));`
);

// 5. Fix loginWithSocial
content = content.replace(
/            const session = createSessionMock\(userId\);\s+await storage\.setItem\(CURRENT_SESSION_KEY, JSON\.stringify\(session\)\);\s+const user: PublicUser = \{[\s\S]+?\}\);\s+setState\(prev => \(\{[\s\S]+?\}\)\);/,
`            await storage.setItem(CURRENT_SESSION_KEY, userId);

            const user: PublicUser = {
                id: userId,
                email,
                name,
                role,
                avatar: profile?.avatar,
                status: 'active',
                emailVerified: true,
                requiresKyc: true,
                termsAcceptedVersion: 1,
                createdAt: new Date().toISOString(),
                providers: [provider],
                kycStatus: 'pending',
                tier: 'Bronze',
                subscriptionStatus: 'inactive',
                subscriptionTier: 'free',
            };

            setState(prev => ({
                ...prev,
                status: 'authenticated',
                user,
                session: { userId } as any,
                originalUser: null,
            }));`
);

// 6. Fix updateRole, updateProfile to stop setting _mockUser
content = content.replace(
/                if \(prev\.session\) \{\s+storage\.setItem\(CURRENT_SESSION_KEY, JSON\.stringify\(\{ \.\.\.prev\.session, _mockUser: updatedUser \}\)\)\.catch\(console\.error\);\s+\}/g,
``
);

fs.writeFileSync(path, content);
console.log('AuthContext refactored.');
