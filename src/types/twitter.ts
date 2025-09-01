export interface TwitterSearchResponse {
  status: string;
  timeline: TwitterTimeline[];
  next_cursor: string;
  prev_cursor: string;
}

export interface TwitterTimeline {
  type: string;
  tweet_id: string;
  screen_name: string;
  bookmarks: number;
  favorites: number;
  created_at: string;
  text: string;
  lang: string;
  source: string;
  quotes: number;
  replies: number;
  conversation_id: string;
  retweets: number;
  views: string;
  entities: TwitterEntities;
  user_info: TwitterUserInfo;
  media: any;
  in_reply_to_screen_name?: string;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  quoted?: TwitterQuoted;
}

export interface TwitterEntities {
  hashtags: any[];
  symbols: any[];
  timestamps?: any[];
  urls: TwitterUrl[];
  user_mentions: TwitterUserMention[];
  media?: TwitterMedia[];
}

export interface TwitterUrl {
  display_url: string;
  expanded_url: string;
  url: string;
  indices: number[];
}

export interface TwitterUserMention {
  id_str: string;
  name: string;
  screen_name: string;
  indices: number[];
}

export interface TwitterMedia {
  display_url: string;
  expanded_url: string;
  id_str: string;
  indices: number[];
  media_key: string;
  media_url_https: string;
  type: string;
  url: string;
  ext_media_availability: TwitterExtMediaAvailability;
  features: TwitterFeatures;
  sizes: TwitterSizes;
  original_info: TwitterOriginalInfo;
  media_results: TwitterMediaResults;
}

export interface TwitterExtMediaAvailability {
  status: string;
}

export interface TwitterFeatures {
  large: TwitterFace[];
  medium: TwitterFace[];
  small: TwitterFace[];
  orig: TwitterFace[];
}

export interface TwitterFace {
  faces: TwitterFaceCoord[];
}

export interface TwitterFaceCoord {
  x: number;
  y: number;
  h: number;
  w: number;
}

export interface TwitterSizes {
  large: TwitterSize;
  medium: TwitterSize;
  small: TwitterSize;
  thumb: TwitterSize;
}

export interface TwitterSize {
  h: number;
  w: number;
  resize: string;
}

export interface TwitterOriginalInfo {
  height: number;
  width: number;
  focus_rects: TwitterFocusRect[];
}

export interface TwitterFocusRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TwitterMediaResults {
  result: TwitterMediaResult;
}

export interface TwitterMediaResult {
  media_key: string;
}

export interface TwitterUserInfo {
  screen_name: string;
  name: string;
  created_at: string;
  description: string;
  rest_id: string;
  followers_count: number;
  favourites_count: number;
  avatar: string;
  verified: boolean;
  friends_count: number;
  location: any;
}

export interface TwitterQuoted {
  tweet_id: string;
  bookmarks: number;
  created_at: string;
  favorites: number;
  text: string;
  lang: string;
  views: string;
  quotes: number;
  replies: number;
  retweets: number;
  conversation_id: string;
  author: TwitterAuthor;
  media: TwitterQuotedMedia;
}

export interface TwitterAuthor {
  rest_id: string;
  created_at: string;
  name: string;
  screen_name: string;
  avatar: string;
  blue_verified: any;
}

export interface TwitterQuotedMedia {
  photo: TwitterPhoto[];
}

export interface TwitterPhoto {
  media_url_https: string;
  id: string;
  sizes: TwitterPhotoSizes;
}

export interface TwitterPhotoSizes {
  h: number;
  w: number;
}

// Database model interfaces for our warning markers
export interface WarningMarker {
  id: number;
  tweetId: string;
  text: string;
  createdAt: Date;
  bookmarks: number;
  favorites: number;
  retweets: number;
  views: string;
  userInfo: TwitterUserInfo;
  extractedLocation?: string;
  lat?: number;
  lng?: number;
  confidenceScore?: number;
  verified: boolean;
  processedAt?: Date;
  updatedAt: Date;
}

// API response types
export interface WarningMarkerResponse {
  success: boolean;
  markers?: WarningMarker[];
  error?: string;
}

export interface TwitterSearchApiResponse {
  success: boolean;
  data?: TwitterSearchResponse;
  processed?: number;
  error?: string;
}
