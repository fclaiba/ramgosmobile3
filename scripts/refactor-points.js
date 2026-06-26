const fs = require('fs');
const path = 'src/contexts/PointsContext.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace storage references with Convex state loading logic
// This script assumes we just replace the body of the useEffect that loads the state

content = content.replace(
    /const load = async \(\) => \{\s+const pt = await storage\.getItem\('@points'\);\s+const lt = await storage\.getItem\('@lifetimePoints'\);\s+const tx = await storage\.getItem\('@transactions'\);\s+const cp = await storage\.getItem\('@challengeProgress'\);\s+const qs = await storage\.getItem\('@quarterSummary'\);[\s\S]+?\} catch \(e\) \{\s+console\.error\('Error loading points:', e\);\s+\}\s+\};\s+load\(\);/m,
    `// State is now loaded reactively via useQuery from Convex
        // Fallback for initial load handled by checking stateServer.
        // We do not load from local storage anymore.`
);

// We need to inject useQuery and useMutation hooks at the top of PointsProvider
content = content.replace(
    /export const PointsProvider: React\.FC<\{ children: ReactNode \}> = \(\{ children \}\) => \{/g,
    `export const PointsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useAuth();
    const serverPointsState = useQuery(api.points.getPointsState, isAuthenticated ? undefined : "skip");
    const syncPointsState = useMutation(api.points.syncPointsState);
    const addLedgerEntry = useMutation(api.points.addLedgerEntry);

    // Reactive sync from server state to local state
    useEffect(() => {
        if (serverPointsState) {
            if (serverPointsState.points !== undefined) setPoints(serverPointsState.points);
            if (serverPointsState.lifetimePoints !== undefined) setLifetimePoints(serverPointsState.lifetimePoints);
            if (serverPointsState.transactions !== undefined) setTransactions(serverPointsState.transactions);
            if (serverPointsState.challengeProgress !== undefined) setChallengeProgress(serverPointsState.challengeProgress);
            if (serverPointsState.quarterSummary !== undefined) setQuarterSummary(serverPointsState.quarterSummary);
        }
    }, [serverPointsState]);
`
);

// Replace the generic 'save' method which writes to AsyncStorage
content = content.replace(
    /const save = async \(\) => \{[\s\S]+?storage\.setItem\('@quarterSummary', JSON\.stringify\(qs\)\),\s+\]\);\s+\} catch \(e\) \{\s+console\.error\('Error saving points:', e\);\s+\}\s+\};/m,
    `const save = async () => {
        if (!isAuthenticated) return;
        try {
            await syncPointsState({
                pointsState: {
                    points,
                    lifetimePoints,
                    transactions,
                    challengeProgress,
                    quarterSummary
                }
            });
        } catch (e) {
            console.error('Error saving points to server:', e);
        }
    };`
);

fs.writeFileSync(path, content);
console.log('PointsContext refactored to use Convex for sync.');
