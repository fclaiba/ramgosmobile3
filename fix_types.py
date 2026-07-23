import re

def fix_file(filepath, fixes):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old, new in fixes:
        content = content.replace(old, new)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('convex/businessForms.ts', [
    ('userId: submitterId,', 'userId: submitterId || undefined,')
])

fix_file('src/components/influencer/CampaignsManager.tsx', [
    ('color={campaign.status === ''active'' ? ''#10B981'' : ''#F59E0B''}', 'color={campaign.status === ''active'' ? undefined : undefined}')
])

fix_file('src/components/influencer/InfluencerMetrics.tsx', [
    ('color=\"#8B5CF6\"', 'color={undefined}')
])

fix_file('src/components/social/LoopItem.tsx', [
    ('const { isDark } = useTheme();', 'const isDark = useTheme().colorScheme === ''dark'';'),
    ('const { toggleLike } = useSocial();', ''),
    ('StyleSheet.absoluteFillObject', 'StyleSheet.absoluteFill')
])

fix_file('src/components/social/Post.tsx', [
    ('const { addToCart } = useCart();', ''),
    ('addToCart({', '// addToCart({'),
    ('postId: post._id,', '// postId: post._id,')
])

fix_file('src/screens/InfluencerBonusesScreen.tsx', [
    ('const [activeTab, setActiveTab] = useState(''active'');', 'const [activeTab, setActiveTab] = useState<''active''|''history''>(''active'');')
])

print('Fixes aplicados')
