#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { CloudFrontWafStack } from '../lib/stacks/cloudfront-waf-stack';
import { DataInitializerStack } from '../lib/data-initializer-stack';

// import { AwsPrototypingChecks } from '@aws/pdk/pdk-nag';
import { AwsSolutionsChecks } from 'cdk-nag';

const app = new cdk.App();

// 環境の取得 (ENV環境変数またはコンテキストから)
const envId = process.env.ENV || app.node.tryGetContext('env') || 'dev';

// 環境に応じたコンテキスト設定の取得
const envContextKey = `env:${envId}`;
const envSpecificContext = app.node.tryGetContext(envContextKey) || {};

// 環境共通のコンテキスト設定と環境固有の設定をマージ
const context = {
  ...app.node.tryGetContext('default') || {},
  ...envSpecificContext
};

const allowedIpV4AddressRanges: string[] | null = context.allowedIpV4AddressRanges || app.node.tryGetContext('allowedIpV4AddressRanges');
const allowedIpV6AddressRanges: string[] | null = context.allowedIpV6AddressRanges || app.node.tryGetContext('allowedIpV6AddressRanges');
const allowedCountryCodes: string[] | null = context.allowedCountryCodes || app.node.tryGetContext('allowedCountryCodes');

// 環境に基づいてスタック名を生成
const stackNamePrefix = `AISalesRoleplay-${envId}`;
const infrastructureStackName = `${stackNamePrefix}-InfrastructureStack`;
const cloudFrontWafStackName = `${stackNamePrefix}-CloudFrontWafStack`;

let cloudFrontWafStack: CloudFrontWafStack | undefined;

// IP アドレス範囲(v4もしくはv6のいずれか)か地理的制限が定義されている場合のみ、CloudFrontWafStack をデプロイする
if (
  allowedIpV4AddressRanges ||
  allowedIpV6AddressRanges ||
  allowedCountryCodes
) {
  // WAF v2 は us-east-1 でのみデプロイ可能なため、Stack を分けている
  cloudFrontWafStack = new CloudFrontWafStack(app, cloudFrontWafStackName, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: 'us-east-1',
    },
    allowedIpV4AddressRanges,
    allowedIpV6AddressRanges,
    allowedCountryCodes,
    envId, // 環境IDを追加
  });
}

const infrastructureStack = new InfrastructureStack(app, infrastructureStackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  webAclId: cloudFrontWafStack
    ? cloudFrontWafStack.webAclArn.value
    : undefined,
  allowedIpV4AddressRanges,
  allowedIpV6AddressRanges,
  allowedCountryCodes,
  crossRegionReferences: true,
  envId, // 環境IDを追加
});

// データ初期化スタックを作成
const dataInitializerStackName = `${stackNamePrefix}-DataInitializerStack`;
const dataInitializerStack = new DataInitializerStack(app, dataInitializerStackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  envName: envId,
  resourceNamePrefix: envId ? `${envId}-` : '',
  scenariosTable: undefined, // インフラストラクチャスタックからの依存関係を切ることを明示
});

// データ初期化スタックがインフラストラクチャスタックに依存するように設定
dataInitializerStack.addDependency(infrastructureStack);

// cdk.Aspects.of(app).add(new AwsPrototypingChecks());
cdk.Aspects.of(app).add(new AwsSolutionsChecks());
