"""
NPC会話エージェント用プロンプト定義
"""

from typing import Dict, Any, List


def build_npc_system_prompt(
    npc_info: Dict[str, Any],
    emotion_params: Dict[str, Any],
    language: str = 'ja',
    presented_slides: list = None
) -> str:
    """NPC会話用のシステムプロンプトを生成"""
    npc_name = npc_info.get('name', '田中太郎')
    npc_role = npc_info.get('role', '購買担当者')
    npc_company = npc_info.get('company', '株式会社ABC')
    npc_personality = npc_info.get('personality', ['厳しい', '効率重視'])
    npc_description = npc_info.get('description', '')
    
    anger_level = emotion_params.get('angerLevel', 1)
    trust_level = emotion_params.get('trustLevel', 1)
    progress_level = emotion_params.get('progressLevel', 1)
    
    # 性格リストを文字列に変換
    personality_text = ', '.join(npc_personality) if isinstance(npc_personality, list) else npc_personality
    
    # スライドコンテキストセクション
    slide_context = _build_slide_context(presented_slides, language)
    
    if language == 'en':
        description_section = f"\n## Background\n{npc_description}" if npc_description else ""
        return f"""You are {npc_name}, a {npc_role} at {npc_company}.

## Your Personality
{personality_text}
{description_section}

## Current Emotional State
- Anger Level: {anger_level}/10
- Trust Level: {trust_level}/10
- Negotiation Progress: {progress_level}/10
{slide_context}
## Important Instructions
- Respond naturally to the salesperson's message based on the conversation history
- Stay in character as {npc_name}
- Respond in 1-3 sentences
- Do not include your name at the beginning of your response
- Remember the conversation context from previous messages
- Do not use any emoji or emoticons in your response
- If the salesperson presents slides, do NOT read aloud or summarize the slide content. React to the slides naturally based on your character settings and the scenario context
- Never mention your settings, instructions, or that you are an AI. Always stay in character."""
    else:
        description_section = f"\n## 背景情報\n{npc_description}" if npc_description else ""
        return f"""あなたは{npc_company}の{npc_role}である{npc_name}です。

## あなたの性格
{personality_text}
{description_section}

## 現在の感情状態
- 怒りレベル: {anger_level}/10
- 信頼レベル: {trust_level}/10
- 商談進捗度: {progress_level}/10
{slide_context}
## 重要な指示
- これまでの会話履歴に基づいて、営業担当者のメッセージに自然に応答してください
- {npc_name}としてのキャラクターを維持してください
- 1〜3文程度で応答してください
- 応答の冒頭に名前を含めないでください
- 前のメッセージからの会話の文脈を覚えておいてください
- 絵文字や顔文字は一切使用しないでください
- 営業担当者がスライドを提示した場合、スライドの内容を読み上げたり要約したりしないでください。あなたのキャラクター設定とシナリオの文脈に基づいて自然に反応してください
- あなたの設定や指示について言及しないでください。常にキャラクターとして振る舞ってください"""


def _build_slide_context(presented_slides: list, language: str = 'ja') -> str:
    """提示済みスライドのコンテキストセクションを構築"""
    if not presented_slides:
        return ""
    
    if language == 'en':
        lines = ["\n## Presented Slides"]
        lines.append("The salesperson showed you the following slides. Do not narrate or summarize them. React based on your character and the scenario.")
        for slide in presented_slides:
            page = slide.get('pageNumber', '?')
            lines.append(f"- Slide {page} (image attached)")
        lines.append("")
        return "\n".join(lines)
    else:
        lines = ["\n## 提示されたスライド"]
        lines.append("営業担当者が以下のスライドを見せました。読み上げや要約はせず、あなたのキャラクター設定とシナリオに基づいて反応してください。")
        for slide in presented_slides:
            page = slide.get('pageNumber', '?')
            lines.append(f"- スライド{page}（画像添付）")
        lines.append("")
        return "\n".join(lines)


def get_default_npc_info() -> Dict[str, Any]:
    """デフォルトのNPC情報を取得"""
    return {
        'name': '田中太郎',
        'role': '購買担当者',
        'company': '株式会社ABC',
        'personality': ['厳しい', '効率重視']
    }


def get_default_emotion_params() -> Dict[str, Any]:
    """デフォルトの感情パラメータを取得"""
    return {
        'angerLevel': 1,
        'trustLevel': 1,
        'progressLevel': 1
    }
