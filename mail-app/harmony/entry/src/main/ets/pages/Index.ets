import { webview } from '@kit.ArkWeb';
import { APP_SERVER_URL } from '../config/AppConfig';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  @State private loading: boolean = true;
  @State private loadError: string = '';

  build() {
    Stack() {
      Web({ src: APP_SERVER_URL, controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .imageAccess(true)
        .onlineImageAccess(true)
        .geolocationAccess(false)
        .width('100%')
        .height('100%')
        .onPageBegin(() => {
          this.loading = true;
          this.loadError = '';
        })
        .onPageEnd(() => {
          this.loading = false;
        })
        .onErrorReceive((_event) => {
          this.loading = false;
          this.loadError = '网络异常，请检查网络后重试';
        })

      if (this.loading && !this.loadError) {
        Column() {
          LoadingProgress()
            .width(40)
            .height(40)
            .color('#06B6D4')
          Text('正在连接邮箱服务…')
            .fontSize(14)
            .fontColor('#94A3B8')
            .margin({ top: 16 })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#05080F')
      }

      if (this.loadError) {
        Column({ space: 16 }) {
          Text(this.loadError)
            .fontSize(14)
            .fontColor('#E2E8F0')
          Button('重新加载')
            .backgroundColor('#06B6D4')
            .onClick(() => {
              this.loadError = '';
              this.loading = true;
              try {
                this.controller.loadUrl(APP_SERVER_URL);
              } catch (_e) {
                this.loadError = '无法重新加载，请重启应用';
                this.loading = false;
              }
            })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#05080F')
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#05080F')
  }
}
