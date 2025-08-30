import type { Metrics } from "../types/index";

export interface DemoStep {
  speaker: "user" | "npc";
  message: string;
  explanation?: string;
  expectedMetricsChange?: Partial<Metrics>;
}

export interface DemoStory {
  id: string;
  title: string;
  description: string;
  steps: DemoStep[];
}

// デモストーリーのデータ
const demoStories: DemoStory[] = [
  {
    id: "new-it-proposal-demo",
    title: "新規IT企業への提案デモ",
    description:
      "IT企業の購買担当者に対する効果的なアプローチ方法と商品提案のデモシナリオ",
    steps: [
      {
        speaker: "user",
        message:
          "お忙しい中、お時間をいただきありがとうございます。本日は御社の業務効率化に関するご提案をさせていただきたいと思います。",
        explanation:
          "最初に丁寧な挨拶で信頼関係の構築を始めています。商品の話を急がず、相手への敬意を示しています。",
        expectedMetricsChange: {
          trustLevel: 1,
        },
      },
      {
        speaker: "npc",
        message:
          "こちらこそ。ただ、時間があまりないので手短にお願いします。具体的にどのようなご提案でしょうか？",
        explanation:
          "相手は忙しいことを伝えています。要点を絞った提案が重要なことがわかります。",
      },
      {
        speaker: "user",
        message:
          "ご多忙の中、お時間をいただき感謝します。早速ですが、まず御社の現状の課題についてお伺いできますか？特にIT基盤や業務プロセスで困っていることはありますか？",
        explanation:
          "商品の話を始める前に、まず顧客の課題を理解しようとしています。ヒアリングから始めるのは効果的なアプローチです。",
        expectedMetricsChange: {
          trustLevel: 2,
          progressLevel: 1,
        },
      },
      {
        speaker: "npc",
        message:
          "そうですね、現在特に課題になっているのはリモートワークでのプロジェクト管理です。チームが分散していると進捗把握や情報共有が難しくなっています。また、セキュリティ面での懸念もあります。",
        explanation:
          "顧客が具体的な課題を話し始めました。これらの課題に対応する提案ができれば信頼度が高まります。",
      },
    ],
  },
  {
    id: "healthcare-solution-demo",
    title: "医療機関向けソリューション提案",
    description: "病院での業務効率化と患者ケア向上のためのシステム提案デモ",
    steps: [
      {
        speaker: "user",
        message:
          "本日は、先生の貴重なお時間をいただきありがとうございます。御院の医療スタッフの業務効率化と患者さんのケア向上に関するご提案をさせていただきたいと思います。",
        explanation:
          "医療関係者に対して敬意を示す挨拶から始めています。「患者さん」という言葉を使うことで、医療従事者が重視する価値観を理解していることを示しています。",
        expectedMetricsChange: {
          trustLevel: 1,
        },
      },
      {
        speaker: "npc",
        message:
          "こちらこそ。最近は患者数が増加していて、スタッフの負担が大きくなっているんです。どのようなソリューションをお考えですか？",
        explanation:
          "顧客が課題を自ら語り始めました。話を聞く姿勢を示しましょう。",
      },
      {
        speaker: "user",
        message:
          "スタッフの皆様のご負担が大きくなっているとのこと、大変ですね。もう少し具体的に、現在の業務の中で特に時間がかかっている部分や、改善したい点などございましたら教えていただけますか？",
        explanation:
          "提案を急がず、まず顧客の課題をより深く理解しようとしています。共感を示しながら質問することで、信頼関係を構築しています。",
        expectedMetricsChange: {
          trustLevel: 2,
          progressLevel: 1,
        },
      },
      {
        speaker: "npc",
        message:
          "特に問題になっているのは、患者情報の管理と予約システムですね。紙ベースでの管理が多く、情報共有がスムーズにいかないことがあります。また、予約の電話対応に看護師の時間が取られていることも課題です。",
        explanation:
          "顧客が具体的な課題を明確にしました。これらに焦点を当てた提案が効果的でしょう。",
      },
    ],
  },
];

// デモストーリーを取得する関数
export const getDemoStoryById = (id: string): DemoStory | undefined => {
  return demoStories.find((story) => story.id === id);
};
