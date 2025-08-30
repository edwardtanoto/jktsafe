export interface Video {
  aweme_id: string;
  video_id: string;
  region: string;
  title: string;
  cover: string;
  ai_dynamic_cover: string;
  origin_cover: string;
  duration: number;
  play: string;
  wmplay: string;
  size: number;
  wm_size: number;
  music: string;
  music_info: {
    id: string;
    title: string;
    play: string;
    cover: string;
    author: string;
    original: boolean;
    duration: number;
    album: string;
  };
  play_count: number;
  digg_count: number;
  comment_count: number;
  share_count: number;
  download_count: number;
  create_time: number;
  anchors: any;
  anchors_extras: string;
  is_ad: boolean;
  commerce_info: {
    auction_ad_invited: boolean;
    with_comment_filter_words: boolean;
    adv_promotable: boolean;
    branded_content_type: number;
    organic_log_extra: string;
  };
  commercial_video_info: string;
  item_comment_settings: number;
  mentioned_users: string;
  author: {
    id: string;
    unique_id: string;
    nickname: string;
    avatar: string;
  };
  is_top: number;
}

export interface Root {
  code: number;
  msg?: string;
  data?: {
    videos: Video[];
    cursor?: string;
    has_more?: boolean;
  };
}