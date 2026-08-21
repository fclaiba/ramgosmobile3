import { PostCardProps } from '../components/social/PostCard';

/**
 * Mapea un post crudo de `decoratePosts` (convex/social.ts) a las props que
 * espera `PostCard`. Vivía sólo dentro de `UnifiedFeed.tsx`'s `renderItem`
 * — se extrae acá para que `CommunityDetailScreen` (B2, feed real de
 * comunidad en vez de texto plano) lo reuse en vez de mantener una segunda
 * copia que se puede desincronizar de `decoratePosts`.
 */
export function mapPostToCardProps(item: any): PostCardProps['post'] {
    return {
        _id: item._id,
        authorUserId: item.authorUserId,
        type: item.type,
        content: item.content,
        images: item.images,
        imageAlts: item.imageAlts,
        videoUrl: item.videoUrl,
        commercialProduct: item.commercialProduct,
        poll: item.poll,
        likesCount: item.likeCount ?? 0,
        commentsCount: item.commentCount ?? 0,
        hasLiked: item.isLikedByMe ?? false,
        audioTrackId: item.audioTrackId,
        audioTrack: item.audioTrack,
        communityId: item.communityId,
        communityName: item.communityName,
    };
}
