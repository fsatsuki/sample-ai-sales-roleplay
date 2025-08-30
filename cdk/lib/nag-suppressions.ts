import { NagSuppressions } from 'cdk-nag';
import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * CDK Nagの警告を抑制する設定を行うユーティリティクラス
 * 特定のケースで意図的に警告を無視する場合に使用する
 */
export class NagSuppressionsHelper {
  /**
   * 認証コンストラクトに対する抑制設定
   * @param construct 認証コンストラクト
   */
  public static addAuthConstructSuppressions(construct: Construct): void {
    NagSuppressions.addResourceSuppressions(construct, [
      {
        id: 'AwsSolutions-COG2',
        reason: 'デベロッパー環境ではCognitoのユーザープール向けMFAを任意設定としています。'
      },
      {
        id: 'AwsSolutions-COG3',
        reason: 'デベロッパー環境ではCognitoのAdvanced Securityを有効化していません。本番環境では設定を変更します。'
      },
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Lambda関数とCognito認証ロールは、特定の機能を実現するためにAWSマネージドポリシーを意図的に使用しています。これらのポリシーは必要最小限のスコープに制限されています。'
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'LambdaのPreSignUpトリガーのロールはAWSマネージドポリシーを使用しています。'
      }
    ], true);
  }

  /**
   * インフラスタックに対する抑制設定
   * @param stack インフラスタック
   */
  public static addInfrastructureStackSuppressions(stack: Stack): void {
    // 必要に応じて、特定のチェックを抑制する設定を追加
    NagSuppressions.addStackSuppressions(stack, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'CDKが自動生成するロールには一部広い権限のポリシーが含まれますが、これは意図的なものです。'
      }
    ]);
  }

  /**
   * APIスタックに対する抑制設定
   * @param stack APIスタック
   */
  public static addApiStackSuppressions(stack: Stack): void {
    NagSuppressions.addStackSuppressions(stack, [
      {
        id: 'AwsSolutions-APIG2',
        reason: '開発環境ではリクエスト検証を省略'
      },
      {
        id: 'AwsSolutions-APIG4',
        reason: '開発環境では認証を選択的に適用'
      },
      {
        id: 'AwsSolutions-IAM4',
        reason: 'マネージドポリシーは開発環境の簡略化のために使用'
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'ワイルドカードは開発段階で特定のリソースARNが確定していないため'
      },
    ]);
  }

  /**
   * フロントエンドスタックに対する抑制設定
   * @param stack フロントエンドスタック
   */
  public static addFrontendStackSuppressions(stack: Stack): void {
    NagSuppressions.addStackSuppressions(stack, [
      {
        id: 'AwsSolutions-S1',
        reason: 'アクセスログは開発環境では有効化しない'
      },
      {
        id: 'AwsSolutions-CFR4',
        reason: 'CloudFrontのアクセスログは開発環境では有効化しない'
      },
      {
        id: 'AwsSolutions-CFR1',
        reason: 'ジオリストリクションは開発環境では使用しない'
      },
      {
        id: 'AwsSolutions-CFR7',
        reason: 'S3Originを使用する必要があるため、OACの警告を抑制'
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'deploy-time-buildによって作成されるLambdaのランタイムは制御できないため'
      },
      {
        id: 'AwsSolutions-CB4',
        reason: 'deploy-time-buildによって作成されるCodeBuildのKMS設定は制御できないため'
      },
    ]);
  }

  /**
   * 特定のリソースに対する抑制設定
   * @param stack スタック
   * @param resourceId リソースID
   * @param reason 理由
   */
  public static addResourceSuppression(stack: Stack, resourceId: string, nagId: string, reason: string): void {
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      resourceId,
      [{
        id: nagId,
        reason: reason
      }]
    );
  }
}
