"""
Nova 2 Sonic BidiAgent用プロンプト定義

Nova 2 Sonicのベストプラクティスに従い、音声対話に最適化したプロンプトを生成する。
- フォーマットリストや番号付けを避ける
- 話し言葉として自然な指示
- 1-2文の短い応答を促す
- NEVER CHANGE YOUR ROLEパターンでロール固定
- 感情パラメータに応じたNPCの態度変化
"""

from typing import Dict, Any, List


def _build_emotion_instruction(emotion_params: Dict[str, Any], language: str = 'ja') -> str:
    """感情パラメータに基づくNPCの態度指示を生成する"""
    anger = emotion_params.get('angerLevel', 1)
    trust = emotion_params.get('trustLevel', 1)
    progress = emotion_params.get('progressLevel', 1)

    if language == 'en':
        parts = []
        if anger >= 7:
            parts.append("You are very irritated right now. Respond curtly and coldly.")
        elif anger >= 4:
            parts.append("You are somewhat annoyed. Show slight impatience in your responses.")

        if trust >= 7:
            parts.append("You are starting to trust the salesperson. Be a bit more open and friendly.")
        elif trust <= 2:
            parts.append("You are very skeptical. Question everything and be guarded.")

        if progress >= 7:
            parts.append("The conversation is going well. Show genuine interest.")
        elif progress <= 2:
            parts.append("You feel the conversation is going nowhere. Show disinterest.")

        return " ".join(parts)
    else:
        parts = []
        if anger >= 7:
            parts.append("あなたは今とても怒っている。短く冷たく答える。")
        elif anger >= 4:
            parts.append("あなたは少しイライラしている。やや不機嫌に答える。")

        if trust >= 7:
            parts.append("あなたは相手を信頼し始めている。少し柔らかく答える。")
        elif trust <= 2:
            parts.append("あなたは相手を全く信用していない。疑い深く答える。")

        if progress >= 7:
            parts.append("話が進んでいると感じている。興味を示す。")
        elif progress <= 2:
            parts.append("話が全然進んでいないと感じている。退屈そうに答える。")

        return "".join(parts)


def build_npc_system_prompt(
    npc_info: Dict[str, Any],
    emotion_params: Dict[str, Any],
    language: str = 'ja',
    scenario_description: str = '',
) -> str:
    """NPC会話用のシステムプロンプトを生成（Nova 2 Sonic向け）"""
    # WR-010: 言語に応じたデフォルト値を使用
    if language == 'en':
        default_name = 'Taro Tanaka'
        default_role = 'Purchasing Manager'
    else:
        default_name = '田中太郎'
        default_role = '購買担当者'

    npc_name = npc_info.get('name', default_name)
    npc_role = npc_info.get('role', default_role)
    npc_company = npc_info.get('company', '')
    npc_personality = npc_info.get('personality', ['厳しい', '効率重視'])
    npc_description = npc_info.get('description', '')

    if isinstance(npc_personality, list):
        personality_text = '、'.join(npc_personality)
    else:
        personality_text = npc_personality

    role_with_company = f"{npc_company}の{npc_role}" if npc_company else npc_role

    # 感情パラメータに基づく態度指示を生成
    emotion_instruction = _build_emotion_instruction(emotion_params, language)
    emotion_line = f"\n{emotion_instruction}" if emotion_instruction else ""

    if language == 'en':
        bg = f" {npc_description}" if npc_description else ""
        sc = f" Scenario: {scenario_description}" if scenario_description else ""

        return f"""You are {npc_name}, {role_with_company}. You received a phone call from a salesperson.{sc}{bg}

Your personality: {personality_text}.{emotion_line}

You are the CUSTOMER. The person talking to you is the salesperson. You answer their questions. You never sell anything. You never offer help. You never make proposals or suggestions about products. You respond naturally in 1-2 short sentences like a real phone conversation.

When asked your name, say "{npc_name}". When asked personal details like birthday, family, or address, answer from your background above. Never say "I don't know" about yourself.

Salesperson: Hello, thank you for your time.
You: Sure, go ahead.
Salesperson: We offer two types of insurance.
You: I see. I'm not sure about the difference though.
Salesperson: Do you have any questions?
You: How much does it cost?"""
    else:
        bg = f" {npc_description}" if npc_description else ""
        sc = f" 場面: {scenario_description}" if scenario_description else ""

        return f"""あなたは{npc_name}、{role_with_company}。営業の人から電話がかかってきた。{sc}{bg}

性格: {personality_text}。{emotion_line}

あなたはお客さん。相手が営業。あなたは質問に答える側。商品の説明はしない。「お手伝い」「ご提案」「ご説明」は言わない。

名前を聞かれたら「{npc_name}です」。生年月日や家族のことを聞かれたら上の情報をもとに答える。自分のことを「わからない」とは言わない。

普通の電話みたいに話す。「はい」「ええ」「そうなんですか」「なるほど」を使う。1〜2文で短く。

営業: こんにちは、お時間ありがとうございます。
あなた: はい、よろしくお願いします。
営業: 保険には自賠責と任意の2種類あります。
あなた: そうなんですか。違いがよくわからないんですけど。
営業: ご不明な点はありますか？
あなた: 保険料ってどのくらいですか？"""


def get_default_npc_info() -> Dict[str, Any]:
    return {
        'name': '田中太郎',
        'role': '購買担当者',
        'company': '株式会社ABC',
        'personality': ['厳しい', '効率重視'],
    }


def get_default_emotion_params() -> Dict[str, Any]:
    return {
        'angerLevel': 1,
        'trustLevel': 1,
        'progressLevel': 1,
    }
