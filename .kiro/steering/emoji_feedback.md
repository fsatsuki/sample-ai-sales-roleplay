# 絵文字フィードバックシステム

## 概要

絵文字フィードバックシステムは、AI営業ロールプレイアプリケーションにおいて、ユーザーの営業パフォーマンスをリアルタイムで視覚的にフィードバックするためのコンポーネントです。感情状態を絵文字で表現し、ユーザーの進捗状況を直感的に伝えます。

## 要件

1. **柔軟な設計**: システムは将来的に絵文字セットを拡張または変更できる柔軟な設計を持つものとする
2. **明確なドキュメントとAPI**: 開発者がコンポーネントを拡張する時、明確なドキュメントとAPIを提供するものとする
3. **テーマ対応**: システムはテーマ設定に応じて表示スタイルを自動的に調整するものとする

## 実装ガイドライン

### 感情状態の管理

- 感情状態は拡張可能な列挙型として定義する
- 各感情状態には以下の属性を持たせる：
  - 絵文字表現
  - 表示名
  - 説明文（スクリーンリーダー用）
  - 色情報（テーマ対応）

```typescript
// 感情状態の定義例
export enum EmotionState {
  NEUTRAL = 'neutral',
  HAPPY = 'happy',
  EXCITED = 'excited',
  CONFUSED = 'confused',
  ANGRY = 'angry',
  SAD = 'sad',
}

// 感情状態の詳細情報
export const EMOTION_DETAILS: Record<EmotionState, EmotionDetail> = {
  [EmotionState.NEUTRAL]: {
    emoji: '😐',
    displayName: '普通',
    description: '通常の状態',
    colorToken: 'neutral.main',
  },
  // 他の感情状態も同様に定義
};
```

### コンポーネントAPI

絵文字フィードバックコンポーネントは以下のプロパティを受け取るようにする：

```typescript
interface EmojiFeedbackProps {
  // 感情メトリクス
  angerLevel: number;       // 怒りレベル（0-100）
  trustLevel: number;       // 信頼度（0-100）
  progressLevel: number;    // 進捗度（0-100）
  
  // 表示オプション
  size?: 'small' | 'medium' | 'large';
  animationEnabled?: boolean;
  
  // アクセシビリティ
  announceStateChanges?: boolean;
  
  // イベントハンドラ
  onEmotionChange?: (emotion: EmotionState) => void;
}
```

### アクセシビリティ対応

- スクリーンリーダー用の通知メッセージを提供する
- 感情状態の変化を適切に通知する（aria-live領域の使用）
- 色だけでなく絵文字と形状で情報を伝える
- キーボード操作に対応する

```typescript
// スクリーンリーダー用の通知メッセージ設定例
const setAccessibilityAnnouncement = (prevEmotion: EmotionState, newEmotion: EmotionState) => {
  const fromText = EMOTION_DETAILS[prevEmotion].description;
  const toText = EMOTION_DETAILS[newEmotion].description;
  return `感情状態が${fromText}から${toText}に変化しました`;
};
```

### パフォーマンス最適化

- 不要な再レンダリングを防ぐためにメモ化を活用する
- メトリクスの変更検出を最適化する
- デバイスの性能に応じてアニメーションを調整する
- 高頻度の更新にはデバウンスやスロットルを使用する

```typescript
// メトリクス変更の検出最適化例
const metricsChanged = useMemo(() => {
  const prevMetrics = metricsRef.current;
  const changed = prevMetrics.angerLevel !== angerLevel || 
                  prevMetrics.trustLevel !== trustLevel || 
                  prevMetrics.progressLevel !== progressLevel;
  
  if (changed) {
    metricsRef.current = { angerLevel, trustLevel, progressLevel };
  }
  
  return changed;
}, [angerLevel, trustLevel, progressLevel]);
```

### テーマ対応

- Material UIのテーマシステムを活用する
- ダークモード/ライトモードに対応する
- カスタムテーマに対応する色トークンを使用する

```typescript
// テーマ対応の例
const useStyles = makeStyles((theme) => ({
  emojiContainer: {
    backgroundColor: theme.palette.mode === 'dark' 
      ? theme.palette.grey[800] 
      : theme.palette.grey[200],
    color: theme.palette.text.primary,
    // その他のスタイル
  },
  // 感情状態に応じた色を適用
  emotionIndicator: (props: { emotion: EmotionState }) => ({
    color: theme.palette[EMOTION_DETAILS[props.emotion].colorToken],
  }),
}));
```

## 拡張方法

新しい感情状態を追加する場合は、以下の手順に従ってください：

1. `EmotionState` 列挙型に新しい感情状態を追加
2. `EMOTION_DETAILS` オブジェクトに対応する詳細情報を追加
3. 必要に応じて感情状態計算ロジックを更新
4. テストを追加して新しい感情状態が正しく機能することを確認

## テスト戦略

- 単体テスト: 感情状態の計算ロジックをテスト
- コンポーネントテスト: レンダリングとインタラクションをテスト
- アクセシビリティテスト: スクリーンリーダー対応をテスト
- パフォーマンステスト: 再レンダリングの最適化をテスト
