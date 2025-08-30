export interface Video {
  video_id: string;
  title: string;
  author: {
    unique_id: string;
    nickname: string;
  };
  music_info?: {
    title: string;
  };
  region: string;
  create_time: number;
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