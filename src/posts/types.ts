export type LatLng = { lat: number; lng: number };

export type PhotoMeta = { takenAtLocal: string | null; utcOffset: string | null; lat: number | null; lng: number | null };

export type PhotoView = { id: string; width: number; height: number; displayUrl: string; thumbUrl: string };
export type EditablePhoto = PhotoView & PhotoMeta;

export type UploadMeta = PhotoMeta & { width: number; height: number; contentType: "image/webp" | "image/jpeg" };

export type PostStatus = "draft" | "published";

export type EditablePost = {
  id: string;
  title: string;
  description: string;
  placeName: string;
  /** Places in travel order; one for most posts, several for a travel day. */
  points: LatLng[];
  /** Wall-clock time at the place, `YYYY-MM-DDTHH:mm:ss`. */
  takenAtLocal: string | null;
  utcOffset: string | null;
  status: PostStatus;
  headlinePhotoId: string | null;
  /** Ready photos only, in display order. */
  photos: EditablePhoto[];
};

export type PostFieldsInput = Omit<EditablePost, "id" | "status" | "photos"> & { photoOrder: string[] };

export type FeedPost = {
  id: string;
  title: string;
  description: string;
  placeName: string;
  takenAtLocal: string;
  headline: PhotoView;
  /** Every other photo, excluding the headline. */
  photos: PhotoView[];
};

export type FeedPage = { posts: FeedPost[]; nextCursor: string | null };

/** One per place: a post with three points contributes three, all carrying its id. */
export type RoutePoint = { postId: string; title: string; dateLabel: string; lat: number; lng: number };

export type AdminPostRow = { id: string; title: string; status: PostStatus; takenAtLocal: string | null; photoCount: number };

export type { ReactionSummary } from "@/reactions/summary";
import type { ReactionSummary } from "@/reactions/summary";

export type FeedItem = FeedPost & { reactions: ReactionSummary[] };
export type FeedItemPage = { posts: FeedItem[]; nextCursor: string | null };
