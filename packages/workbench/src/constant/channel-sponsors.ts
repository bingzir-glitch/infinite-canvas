export type ChannelSponsor = {
    id: string;
    name: string;
    description: string;
    baseUrl: string;
    website: string;
    logo: string;
};

// 渠道快捷选择列表。
// 上游项目在这里放了一批带返利链接的推广渠道；本 fork 独立维护后已清空，
// 用户在「配置 → 渠道」里手动填写自己的接口地址与密钥。
// 若要预置自己的渠道，按上面的类型自行追加即可（logo 放 apps/web/public/sponsors/ 下）。
export const channelSponsors: ChannelSponsor[] = [];
