/**
 * AWS設定ファイル
 *
 * AWS AmplifyなどのAWSサービスの設定を行います
 */
import { Amplify } from "aws-amplify";
import type { ResourcesConfig } from "aws-amplify";

/**
 * AWS設定を初期化
 */
export function configureAws(): void {
  // 環境変数から設定を取得
  const region = import.meta.env.VITE_AWS_REGION;
  const userPoolId = import.meta.env.VITE_USER_POOL_ID;
  const userPoolWebClientId = import.meta.env.VITE_USER_POOL_WEB_CLIENT_ID;
  const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;

  const config: ResourcesConfig = {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId: userPoolWebClientId,
        identityPoolId: import.meta.env.VITE_IDENTITY_POOL_ID,
      },
    },
    API: {
      REST: {
        AISalesRolePlayAPI: {
          endpoint: apiEndpoint,
          region,
        },
      },
    },
    Storage: {
      S3: {
        bucket: "aisalesroleplay-assets",
        region,
      },
    },
  };

  // Amplifyを設定
  Amplify.configure(config);

  console.log("✅ AWS設定が完了しました");
}
