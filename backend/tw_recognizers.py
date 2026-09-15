from presidio_analyzer import Pattern, PatternRecognizer


# ============================================================
# 1. 台灣身分證字號
#
# 例如：
# A123456789
#
# 格式：
# 1 個英文字母 + 9 個數字
# 第 2 碼為 1 或 2
# 最後使用官方 checksum 驗證
# ============================================================

class TaiwanNationalIdRecognizer(PatternRecognizer):

    LETTER_CODES = {
        "A": 10,
        "B": 11,
        "C": 12,
        "D": 13,
        "E": 14,
        "F": 15,
        "G": 16,
        "H": 17,
        "I": 34,
        "J": 18,
        "K": 19,
        "L": 20,
        "M": 21,
        "N": 22,
        "O": 35,
        "P": 23,
        "Q": 24,
        "R": 25,
        "S": 26,
        "T": 27,
        "U": 28,
        "V": 29,
        "W": 32,
        "X": 30,
        "Y": 31,
        "Z": 33,
    }

    PATTERNS = [
        Pattern(
            name="Taiwan National ID",
            regex=r"(?<![A-Za-z0-9])[A-Za-z][12]\d{8}(?![A-Za-z0-9])",
            score=0.7,
        )
    ]

    def __init__(self):
        super().__init__(
            supported_entity="TW_NATIONAL_ID",
            patterns=self.PATTERNS,
            supported_language="zh",
        )

    def validate_result(self, pattern_text: str):

        value = pattern_text.upper().strip()

        if len(value) != 10:
            return False

        if value[0] not in self.LETTER_CODES:
            return False

        if value[1] not in ("1", "2"):
            return False

        if not value[1:].isdigit():
            return False

        letter_value = self.LETTER_CODES[value[0]]

        tens = letter_value // 10
        ones = letter_value % 10

        total = tens + ones * 9

        weights = [8, 7, 6, 5, 4, 3, 2, 1, 1]

        for digit, weight in zip(value[1:], weights):
            total += int(digit) * weight

        return total % 10 == 0


# ============================================================
# 2. 台灣統一編號
#
# 8 位數
#
# 新版檢核規則：
# 權重 1 2 1 2 1 2 4 1
#
# 加總後能被 5 整除即通過。
#
# 如果第 7 碼是 7：
# total 或 total + 1
# 任一能被 5 整除即可。
# ============================================================

class TaiwanBusinessIdRecognizer(PatternRecognizer):

    PATTERNS = [
        Pattern(
            name="Taiwan Unified Business Number",
            regex=r"(?<!\d)\d{8}(?!\d)",
            score=0.6,
        )
    ]

    def __init__(self):
        super().__init__(
            supported_entity="TW_BUSINESS_ID",
            patterns=self.PATTERNS,
            supported_language="zh",
        )

    def validate_result(self, pattern_text: str):

        value = pattern_text.strip()

        if len(value) != 8:
            return False

        if not value.isdigit():
            return False

        if value == "00000000":
            return False

        weights = [1, 2, 1, 2, 1, 2, 4, 1]

        total = 0

        for digit, weight in zip(value, weights):

            product = int(digit) * weight

            # 如果乘積是兩位數，
            # 把十位與個位相加。
            #
            # 例如：
            # 8 * 2 = 16
            # 1 + 6 = 7

            total += product // 10
            total += product % 10

        # 一般情況
        if total % 5 == 0:
            return True

        # 官方規則：
        # 第 7 碼為 7 時，
        # total + 1 也要再測試一次。
        if value[6] == "7":
            if (total + 1) % 5 == 0:
                return True

        return False


# ============================================================
# 3. 台灣電話
# ============================================================

class TaiwanPhoneRecognizer(PatternRecognizer):

    PATTERNS = [

        # ====================================================
        # 手機
        #
        # 支援：
        #
        # 0912345678
        # 0912-345-678
        # 0912 345 678
        #
        # +886 912 345 678
        # +886-912-345-678
        # ====================================================

        Pattern(
            name="Taiwan Mobile Number",
            regex=(
                r"(?<!\d)"
                r"(?:"
                    r"09\d{2}[-\s]?\d{3}[-\s]?\d{3}"
                    r"|"
                    r"\+886[-\s]?9\d{2}[-\s]?\d{3}[-\s]?\d{3}"
                r")"
                r"(?!\d)"
            ),
            score=0.85,
        ),


        # ====================================================
        # 市話
        #
        # 支援：
        #
        # 02-2345-6789
        # 02-23456789
        # 02 23456789
        # 02 2345 6789
        #
        # (02) 23456789
        # (02) 2345-6789
        #
        # 037-123456
        # 049-1234567
        # 089-123456
        #
        #
        # 重要：
        #
        # 沒有括號時，
        # 區碼後「一定」要有 - 或空格。
        #
        # 所以：
        #
        # 04595257
        #
        # 不會被誤判成：
        #
        # 04 + 595257
        #
        # ====================================================

        Pattern(
            name="Taiwan Landline Number",
            regex=(
                r"(?<!\d)"

                r"(?:"

                    # -----------------------------
                    # 有括號的區碼
                    #
                    # (02)
                    # (037)
                    # (049)
                    # -----------------------------

                    r"\("
                    r"(?:"
                        r"0826"
                        r"|0836"
                        r"|037"
                        r"|049"
                        r"|082"
                        r"|089"
                        r"|02"
                        r"|03"
                        r"|04"
                        r"|05"
                        r"|06"
                        r"|07"
                        r"|08"
                    r")"
                    r"\)"
                    r"\s*"

                    r"|"

                    # -----------------------------
                    # 沒有括號
                    #
                    # 區碼後一定需要 - 或空格
                    # -----------------------------

                    r"(?:"
                        r"0826"
                        r"|0836"
                        r"|037"
                        r"|049"
                        r"|082"
                        r"|089"
                        r"|02"
                        r"|03"
                        r"|04"
                        r"|05"
                        r"|06"
                        r"|07"
                        r"|08"
                    r")"
                    r"[-\s]+"

                r")"

                # -----------------------------
                # 本地號碼
                #
                # 23456789
                # 2345-6789
                # 2345 6789
                # -----------------------------

                r"(?:"
                    r"\d{5,8}"
                    r"|"
                    r"\d{3,4}[-\s]\d{3,4}"
                r")"

                # -----------------------------
                # 可選分機
                #
                # #123
                # 分機 123
                # ext. 123
                # -----------------------------

                r"(?:"
                    r"\s*"
                    r"(?:#|分機|ext\.?)"
                    r"\s*"
                    r"\d{1,5}"
                r")?"

                r"(?!\d)"
            ),
            score=0.8,
        ),
    ]

    def __init__(self):
        super().__init__(
            supported_entity="TW_PHONE_NUMBER",
            patterns=self.PATTERNS,
            supported_language="zh",
        )


# ============================================================
# 4. 台灣直轄市／縣市名稱（地點）
#
# 例如：新北、新北市、臺中市、花蓮縣
#
# 模型會漏掉沒有「市／縣」尾字、又黏著其他詞的地名（「新北青年」）。
# 這裡用固定清單補上，分數低於模型：與模型實體重疊時由模型的結果決定。
# 已知誤判：「重新北上」會含「新北」。
# ============================================================

TAIWAN_DIVISIONS = (
    '臺北', '台北', '新北', '桃園', '臺中', '台中', '臺南', '台南', '高雄', '基隆', '新竹', '嘉義', '苗栗',
    '彰化', '南投', '雲林', '屏東', '宜蘭', '花蓮', '臺東', '台東', '澎湖', '金門', '連江',
)


class TaiwanDivisionRecognizer(PatternRecognizer):
    def __init__(self):
        super().__init__(
            supported_entity='LOCATION',
            supported_language='zh',
            name='TaiwanDivisionRecognizer',
            patterns=[Pattern('tw-division', '(?:' + '|'.join(TAIWAN_DIVISIONS) + ')(?:市|縣)?', 0.55)],
        )
