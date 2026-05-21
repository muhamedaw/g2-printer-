import type { RawSignal, Platform } from '@mpg2/shared';
import { extractContracts } from '../extractors/contract-extractor.js';

interface ScrapedPost {
  platform: Platform;
  text: string;
  authorUsername: string | undefined;
  followers: number;
  likes: number;
  reposts: number;
  replies: number;
  views: number;
  createdAt: Date;
}

const PLATFORM_WEIGHT: Record<Platform, number> = {
  twitter:   1.5,
  tiktok:    1.8,
  reddit:    1.2,
  telegram:  1.0,
  instagram: 1.1,
  news:      0.8,
};

function calcEngagement(post: ScrapedPost): number {
  const w = post.platform === 'twitter'
    ? { like: 1, repost: 3, reply: 2, view: 0.01 }
    : post.platform === 'tiktok'
    ? { like: 0.5, repost: 5, reply: 1.5, view: 0.005 }
    : post.platform === 'instagram'
    ? { like: 1, repost: 2, reply: 1, view: 0 }
    : post.platform === 'reddit'
    ? { like: 0.5, repost: 2, reply: 1.5, view: 0 }
    : post.platform === 'telegram'
    ? { like: 0, repost: 0, reply: 0, view: 0.05 }
    : { like: 0, repost: 0, reply: 0, view: 0 };

  const raw = post.likes * w.like + post.reposts * w.repost + post.replies * w.reply + post.views * w.view;
  return raw > 0 ? Math.log10(raw + 1) * 10 : 0;
}

function calcInfluencerWeight(followers: number): number {
  if (followers > 100_000) return 2.0;
  if (followers > 10_000)  return 1.5;
  if (followers > 1_000)   return 1.2;
  return 1.0;
}

export function toRawSignal(post: ScrapedPost): RawSignal {
  const contracts = extractContracts(post.text);
  return {
    platform:         post.platform,
    content:          post.text,
    contractAddress:  contracts[0],
    authorUsername:   post.authorUsername,
    authorFollowers:  post.followers,
    engagementScore:  calcEngagement(post),
    platformWeight:   PLATFORM_WEIGHT[post.platform],
    influencerWeight: calcInfluencerWeight(post.followers),
    processed:        false,
    createdAt:        post.createdAt,
  };
}
