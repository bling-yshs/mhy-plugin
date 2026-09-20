import type { GenshinCharacterDetailData } from './genshin-character-detail.js';
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue | undefined;
};
export type Game = 'gs' | 'sr' | 'zzz';
export type ApiResponse<T = Record<string, JsonValue>> = {
    retcode: number;
    message: string;
    data: T;
    api?: string;
};
export type Device = {
    device_id: string;
    device_fp?: string;
    android?: Record<string, string>;
    expiresAt?: number;
};
export type LoginDevice = {
    device_id: string;
    device_name: string;
    device_model: string;
};
export type GameRole = {
    game_biz: string;
    game_uid: string;
    region: string;
    nickname?: string;
    [key: string]: JsonValue | undefined;
};
export type RequestContext = {
    game: Game;
    uid: string;
    server?: string;
    accountId?: string;
    userId?: string;
    cookie?: string;
    device?: string;
    signal?: AbortSignal;
    profile?: 'genshin' | 'zzz';
};
export interface Operations {
    index: {
        params: {
            avatar_list_type?: number;
        };
        data: Record<string, JsonValue>;
    };
    dailyNote: {
        params: Record<string, never>;
        data: Record<string, JsonValue>;
    };
    character: {
        params: Record<string, never>;
        data: Record<string, JsonValue>;
    };
    characterDetail: {
        params: {
            character_ids: number[];
        };
        data: GenshinCharacterDetailData;
    };
    avatarInfo: {
        params: {
            need_wiki?: boolean;
        };
        data: Record<string, JsonValue>;
    };
    basicInfo: {
        params: Record<string, never>;
        data: Record<string, JsonValue>;
    };
    spiralAbyss: {
        params: {
            schedule_type?: number;
            need_detail?: boolean;
            need_all?: boolean;
        };
        data: Record<string, JsonValue>;
    };
    role_combat: {
        params: {
            active?: number;
            schedule_type?: number;
            need_detail?: boolean;
            need_all?: boolean;
        };
        data: Record<string, JsonValue>;
    };
    hard_challenge: {
        params: {
            schedule_type?: number;
            need_detail?: boolean;
            need_all?: boolean;
        };
        data: Record<string, JsonValue>;
    };
    hard_challenge_popularity: {
        params: Record<string, never>;
        data: Record<string, JsonValue>;
    };
    zzzAvatarInfo: {
        params: {
            id_list?: number[];
            need_wiki?: boolean;
        };
        data: Record<string, JsonValue>;
    };
    zzzExplorationDetail: {
        params: Record<string, never>;
        data: Record<string, JsonValue>;
    };
    buddy: {
        params: Record<string, never>;
        data: Record<string, JsonValue>;
    };
}
