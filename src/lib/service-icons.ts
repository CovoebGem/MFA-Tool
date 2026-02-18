export const serviceIcons: Record<string, string> = {
  google: "https://www.google.com/favicon.ico",
  github: "https://github.com/favicon.ico",
  microsoft: "https://www.microsoft.com/favicon.ico",
  apple: "https://www.apple.com/favicon.ico",
  amazon: "https://www.amazon.com/favicon.ico",
  facebook: "https://www.facebook.com/favicon.ico",
  twitter: "https://twitter.com/favicon.ico",
  x: "https://x.com/favicon.ico",
  linkedin: "https://www.linkedin.com/favicon.ico",
  discord: "https://discord.com/favicon.ico",
  steam: "https://store.steampowered.com/favicon.ico",
  epic: "https://www.epicgames.com/favicon.ico",
  dropbox: "https://www.dropbox.com/favicon.ico",
  reddit: "https://www.reddit.com/favicon.ico",
  instagram: "https://www.instagram.com/favicon.ico",
  tiktok: "https://www.tiktok.com/favicon.ico",
  snapchat: "https://www.snapchat.com/favicon.ico",
  pinterest: "https://www.pinterest.com/favicon.ico",
  twitch: "https://www.twitch.tv/favicon.ico",
  spotify: "https://www.spotify.com/favicon.ico",
  netflix: "https://www.netflix.com/favicon.ico",
  paypal: "https://www.paypal.com/favicon.ico",
  stripe: "https://stripe.com/favicon.ico",
  coinbase: "https://www.coinbase.com/favicon.ico",
  binance: "https://www.binance.com/favicon.ico",
  kraken: "https://www.kraken.com/favicon.ico",
  cloudflare: "https://www.cloudflare.com/favicon.ico",
  digitalocean: "https://www.digitalocean.com/favicon.ico",
  heroku: "https://www.heroku.com/favicon.ico",
  vercel: "https://vercel.com/favicon.ico",
  netlify: "https://www.netlify.com/favicon.ico",
  gitlab: "https://gitlab.com/favicon.ico",
  bitbucket: "https://bitbucket.org/favicon.ico",
  atlassian: "https://www.atlassian.com/favicon.ico",
  notion: "https://www.notion.so/favicon.ico",
  slack: "https://slack.com/favicon.ico",
  zoom: "https://zoom.us/favicon.ico",
  figma: "https://www.figma.com/favicon.ico",
  adobe: "https://www.adobe.com/favicon.ico",
  aws: "https://aws.amazon.com/favicon.ico",
  "amazon web services": "https://aws.amazon.com/favicon.ico",
  azure: "https://azure.microsoft.com/favicon.ico",
  "microsoft azure": "https://azure.microsoft.com/favicon.ico",
  gcp: "https://cloud.google.com/favicon.ico",
  "google cloud": "https://cloud.google.com/favicon.ico",
  alibaba: "https://www.alibaba.com/favicon.ico",
  "alibaba cloud": "https://www.alibabacloud.com/favicon.ico",
  tencent: "https://www.tencent.com/favicon.ico",
  baidu: "https://www.baidu.com/favicon.ico",
  wechat: "https://www.wechat.com/favicon.ico",
  weibo: "https://weibo.com/favicon.ico",
  qq: "https://im.qq.com/favicon.ico",
  bilibili: "https://www.bilibili.com/favicon.ico",
  douyin: "https://www.douyin.com/favicon.ico",
  outlook: "https://outlook.live.com/favicon.ico",
  "outlook.com": "https://outlook.live.com/favicon.ico",
  hotmail: "https://outlook.live.com/favicon.ico",
  yahoo: "https://www.yahoo.com/favicon.ico",
  protonmail: "https://proton.me/favicon.ico",
  "proton mail": "https://proton.me/favicon.ico",
  mailchimp: "https://mailchimp.com/favicon.ico",
  sendgrid: "https://sendgrid.com/favicon.ico",
  twilio: "https://www.twilio.com/favicon.ico",
  okta: "https://www.okta.com/favicon.ico",
  auth0: "https://auth0.com/favicon.ico",
  duo: "https://duo.com/favicon.ico",
  "duo security": "https://duo.com/favicon.ico",
  lastpass: "https://www.lastpass.com/favicon.ico",
  "1password": "https://1password.com/favicon.ico",
  bitwarden: "https://bitwarden.com/favicon.ico",
  keepass: "https://keepass.info/favicon.ico",
  linode: "https://www.linode.com/favicon.ico",
  vultr: "https://www.vultr.com/favicon.ico",
  ovh: "https://www.ovh.com/favicon.ico",
  namecheap: "https://www.namecheap.com/favicon.ico",
  godaddy: "https://www.godaddy.com/favicon.ico",
  cloudns: "https://www.cloudns.net/favicon.ico",
};

export function getServiceIconUrl(issuer: string): string | null {
  if (!issuer) return null;
  const normalizedIssuer = issuer.toLowerCase().trim();
  
  if (serviceIcons[normalizedIssuer]) {
    return serviceIcons[normalizedIssuer];
  }
  
  for (const [key, url] of Object.entries(serviceIcons)) {
    if (normalizedIssuer.includes(key) || key.includes(normalizedIssuer)) {
      return url;
    }
  }
  
  return null;
}

export function getFallbackIcon(issuer: string): string {
  const initial = issuer?.charAt(0)?.toUpperCase() || "?";
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#6366f1"/>
      <text x="16" y="22" text-anchor="middle" fill="white" font-family="system-ui, sans-serif" font-size="16" font-weight="600">${initial}</text>
    </svg>
  `)}`;
}
