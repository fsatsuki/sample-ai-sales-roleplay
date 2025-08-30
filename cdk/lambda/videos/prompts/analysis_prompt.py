"""
セールストレーニング用AI分析エンジンのプロンプトテンプレート
"""

# ビデオ分析プロンプトテンプレート - 日本語
VIDEO_ANALYSIS_PROMPT_JA = """この動画を分析して営業スキルを評価してください。

## 評価項目（1-10点）:
- 視線: アイコンタクト
- 表情: 豊かさと適切さ  
- 身振り: 自然さと効果
- 感情表現: 内容との一致

## 評価基準
- 加点方式です。それぞれの評価項目で強みがあれば加点します。
- 初期値は1です。

## JSON形式で回答:
{
    "strengths": [{"title": "強み", "description": "説明"}],
    "improvements": [{"title": "改善点", "description": "説明"}],
    
    "eyeContact": 数値(1-10),
    "facialExpression": 数値(1-10),
    "gesture": 数値(1-10),
    "emotion": 数値(1-10),
    "overallScore": 数値(1-10),
    "analysis": "総合分析"
}"""

# ビデオ分析プロンプトテンプレート - 英語
VIDEO_ANALYSIS_PROMPT_EN = """Please analyze this video and evaluate sales skills.

## Evaluation Items (1-10 points):
- Eye Contact: Eye contact with the camera/audience
- Facial Expression: Richness and appropriateness
- Gesture: Naturalness and effectiveness
- Emotional Expression: Alignment with content

## Evaluation Criteria
- This is a point-addition system. Points are added for strengths in each evaluation category.
- The starting value is 1.

## Respond in JSON format:
{
    "strengths": [{"title": "Strength", "description": "Description"}],
    "improvements": [{"title": "Improvement", "description": "Description"}],
    "eyeContact": number(1-10),
    "facialExpression": number(1-10),
    "gesture": number(1-10),
    "emotion": number(1-10),
    "overallScore": number(1-10),
    "analysis": "Overall analysis"
}"""

# Default template to maintain backward compatibility
VIDEO_ANALYSIS_PROMPT_TEMPLATE = VIDEO_ANALYSIS_PROMPT_JA
