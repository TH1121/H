import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';

const DOMAIN = 0x0000;

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, 'CloudMail', 'Ability onCreate');
  }

  onDestroy(): void {
    hilog.info(DOMAIN, 'CloudMail', 'Ability onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(DOMAIN, 'CloudMail', 'Ability onWindowStageCreate');
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, 'CloudMail', 'Failed to load content %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, 'CloudMail', 'Succeeded in loading content');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, 'CloudMail', 'Ability onWindowStageDestroy');
  }

  onForeground(): void {
    hilog.info(DOMAIN, 'CloudMail', 'Ability onForeground');
  }

  onBackground(): void {
    hilog.info(DOMAIN, 'CloudMail', 'Ability onBackground');
  }
}
