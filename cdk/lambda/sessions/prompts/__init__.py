"""
プロンプトモジュール - プロンプトテンプレートを管理するモジュール
"""

def get_analysis_prompt(anger_value, trust_value, progress_value, conversation_text, goal_analysis_section="", language="ja"):
    """
    会話分析用のプロンプトを生成する関数
    
    Args:
        anger_value (int): 怒りの値 (0-10)
        trust_value (int): 信頼の値 (0-10)
        progress_value (int): 進捗の値 (0-10)
        conversation_text (str): 会話履歴テキスト
        goal_analysis_section (str): 目標分析セクション (オプション)
        language (str): 言語コード (デフォルト: "ja", 英語の場合は "en")
        
    Returns:
        str: 分析用のプロンプト
    """
    from .analysis_prompt import ANALYSIS_PROMPT_JA, ANALYSIS_PROMPT_EN
    
    # 言語に応じたテンプレートを選択
    template = ANALYSIS_PROMPT_EN if language == "en" else ANALYSIS_PROMPT_JA
    
    return template.format(
        anger_value=anger_value,
        trust_value=trust_value, 
        progress_value=progress_value,
        conversation_text=conversation_text,
        goal_analysis_section=goal_analysis_section
    )
