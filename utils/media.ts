/**
 * 媒体工具：图片压缩 / 云存储下载上传 / 旧空间文件识别
 * 压缩档位（迁移旧附件与新上传共用）：长边 1280px、质量 60%
 */

const LONG_EDGE = 1280;
const QUALITY = 60;

/** 压缩图片到统一档位；任何一步失败都回退原图，不阻断流程 */
export function compressImage(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    uni.getImageInfo({
      src: filePath,
      success: ({ width, height }) => {
        const long = Math.max(width, height);
        const scale = long > LONG_EDGE ? LONG_EDGE / long : 1;
        const opts: any = { src: filePath, quality: QUALITY };
        if (scale < 1) {
          opts.compressedWidth = Math.round(width * scale);
          opts.compressedHeight = Math.round(height * scale);
        }
        uni.compressImage({
          ...opts,
          success: ({ tempFilePath }: any) => resolve(tempFilePath || filePath),
          fail: () => resolve(filePath),
        } as any);
      },
      fail: () => resolve(filePath),
    });
  });
}

/** 下载网络文件到本地临时路径（旧空间文件ID是可直接访问的 HTTPS URL） */
export function downloadFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200) resolve(res.tempFilePath);
        else reject(new Error(`下载失败 statusCode=${res.statusCode}`));
      },
      fail: reject,
    });
  });
}

/** 上传本地文件到当前服务空间云存储，返回 fileID */
export function uploadCloudFile(filePath: string, cloudPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line
    uniCloud.uploadFile({
      filePath,
      cloudPath,
      success: (res: any) => resolve(res.fileID),
      fail: reject,
    } as any);
  });
}

/** 旧阿里云空间文件ID标记（bspapp.com 域名；新支付宝云为 cloudstatic.cn） */
export function isLegacyFileID(id: unknown): boolean {
  return typeof id === "string" && id.indexOf("bspapp.com") >= 0;
}

/** 从 URL 提取小写扩展名，不合法时用 fallback */
export function extOf(url: string, fallback: string): string {
  const clean = String(url).split("?")[0];
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return fallback;
  const ext = clean.slice(dot + 1);
  return /^[a-zA-Z0-9]{1,5}$/.test(ext) ? ext.toLowerCase() : fallback;
}

/** 迁移附件的云存储路径 */
export function migratePath(ext: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `notes/migrate/${Date.now()}_${rand}.${ext}`;
}
