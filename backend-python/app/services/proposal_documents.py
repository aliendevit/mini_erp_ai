from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any, Mapping
from xml.sax.saxutils import escape

_FONT_REGISTRY: dict[str, tuple[str, str]] = {}

_ARABIC_FORMS: dict[str, tuple[str, ...]] = {
    "\u0621": ("\ufe80",),
    "\u0622": ("\ufe81", "\ufe82"),
    "\u0623": ("\ufe83", "\ufe84"),
    "\u0624": ("\ufe85", "\ufe86"),
    "\u0625": ("\ufe87", "\ufe88"),
    "\u0626": ("\ufe89", "\ufe8a", "\ufe8b", "\ufe8c"),
    "\u0627": ("\ufe8d", "\ufe8e"),
    "\u0628": ("\ufe8f", "\ufe90", "\ufe91", "\ufe92"),
    "\u0629": ("\ufe93", "\ufe94"),
    "\u062a": ("\ufe95", "\ufe96", "\ufe97", "\ufe98"),
    "\u062b": ("\ufe99", "\ufe9a", "\ufe9b", "\ufe9c"),
    "\u062c": ("\ufe9d", "\ufe9e", "\ufe9f", "\ufea0"),
    "\u062d": ("\ufea1", "\ufea2", "\ufea3", "\ufea4"),
    "\u062e": ("\ufea5", "\ufea6", "\ufea7", "\ufea8"),
    "\u062f": ("\ufea9", "\ufeaa"),
    "\u0630": ("\ufeab", "\ufeac"),
    "\u0631": ("\ufead", "\ufeae"),
    "\u0632": ("\ufeaf", "\ufeb0"),
    "\u0633": ("\ufeb1", "\ufeb2", "\ufeb3", "\ufeb4"),
    "\u0634": ("\ufeb5", "\ufeb6", "\ufeb7", "\ufeb8"),
    "\u0635": ("\ufeb9", "\ufeba", "\ufebb", "\ufebc"),
    "\u0636": ("\ufebd", "\ufebe", "\ufebf", "\ufec0"),
    "\u0637": ("\ufec1", "\ufec2", "\ufec3", "\ufec4"),
    "\u0638": ("\ufec5", "\ufec6", "\ufec7", "\ufec8"),
    "\u0639": ("\ufec9", "\ufeca", "\ufecb", "\ufecc"),
    "\u063a": ("\ufecd", "\ufece", "\ufecf", "\ufed0"),
    "\u0641": ("\ufed1", "\ufed2", "\ufed3", "\ufed4"),
    "\u0642": ("\ufed5", "\ufed6", "\ufed7", "\ufed8"),
    "\u0643": ("\ufed9", "\ufeda", "\ufedb", "\ufedc"),
    "\u0644": ("\ufedd", "\ufede", "\ufedf", "\ufee0"),
    "\u0645": ("\ufee1", "\ufee2", "\ufee3", "\ufee4"),
    "\u0646": ("\ufee5", "\ufee6", "\ufee7", "\ufee8"),
    "\u0647": ("\ufee9", "\ufeea", "\ufeeb", "\ufeec"),
    "\u0648": ("\ufeed", "\ufeee"),
    "\u0649": ("\ufeef", "\ufef0"),
    "\u064a": ("\ufef1", "\ufef2", "\ufef3", "\ufef4"),
    "\u067e": ("\ufb56", "\ufb57", "\ufb58", "\ufb59"),
    "\u0686": ("\ufb7a", "\ufb7b", "\ufb7c", "\ufb7d"),
    "\u06a9": ("\ufb8e", "\ufb8f", "\ufb90", "\ufb91"),
    "\u06af": ("\ufb92", "\ufb93", "\ufb94", "\ufb95"),
    "\u06cc": ("\ufbfc", "\ufbfd", "\ufbfe", "\ufbff"),
}

_ARABIC_DIACRITICS = set("\u064b\u064c\u064d\u064e\u064f\u0650\u0651\u0652\u0670")


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _safe_number(value: Any) -> str:
    if value is None or value == "":
        return "-"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return f"{value:.2f}"
    return str(value)


def _list_text(values: Any) -> str:
    if not isinstance(values, list):
        return "-"
    items = [_safe_text(item) for item in values if _safe_text(item)]
    return ", ".join(items) if items else "-"


def _is_arabic_char(char: str) -> bool:
    return "\u0600" <= char <= "\u06ff" or "\u0750" <= char <= "\u077f" or "\u08a0" <= char <= "\u08ff"


def _can_connect_to_previous(char: str) -> bool:
    return len(_ARABIC_FORMS.get(char, ())) >= 2


def _can_connect_to_next(char: str) -> bool:
    return len(_ARABIC_FORMS.get(char, ())) == 4


def _shape_arabic_run(text: str) -> str:
    chars = list(text)
    shaped: list[str] = []
    for index, char in enumerate(chars):
        forms = _ARABIC_FORMS.get(char)
        if not forms:
            shaped.append(char)
            continue

        previous_index = index - 1
        while previous_index >= 0 and chars[previous_index] in _ARABIC_DIACRITICS:
            previous_index -= 1
        next_index = index + 1
        while next_index < len(chars) and chars[next_index] in _ARABIC_DIACRITICS:
            next_index += 1

        previous_char = chars[previous_index] if previous_index >= 0 else ""
        next_char = chars[next_index] if next_index < len(chars) else ""
        connects_previous = _can_connect_to_previous(char) and _can_connect_to_next(previous_char)
        connects_next = _can_connect_to_next(char) and _can_connect_to_previous(next_char)

        if len(forms) == 1:
            shaped.append(forms[0])
        elif len(forms) == 2:
            shaped.append(forms[1] if connects_previous else forms[0])
        elif connects_previous and connects_next:
            shaped.append(forms[3])
        elif connects_previous:
            shaped.append(forms[1])
        elif connects_next:
            shaped.append(forms[2])
        else:
            shaped.append(forms[0])
    return "".join(shaped)


def _arabic_visual_text(text: str) -> str:
    lines: list[str] = []
    for line in text.splitlines():
        runs: list[tuple[bool, str]] = []
        current = ""
        current_is_arabic: bool | None = None
        for char in line:
            char_is_arabic = _is_arabic_char(char)
            if current and char_is_arabic != current_is_arabic:
                runs.append((bool(current_is_arabic), current))
                current = char
            else:
                current += char
            current_is_arabic = char_is_arabic
        if current:
            runs.append((bool(current_is_arabic), current))

        visual_parts: list[str] = []
        for is_arabic, run in reversed(runs):
            visual_parts.append(_shape_arabic_run(run)[::-1] if is_arabic else run)
        lines.append("".join(visual_parts))
    return "\n".join(lines)


def _display_text(value: Any, locale: str) -> str:
    text = _safe_text(value)
    if locale == "ar":
        return _arabic_visual_text(text)
    return text


def _paragraph_text(value: Any, locale: str = "en") -> str:
    text = _safe_text(value)
    if not text:
        return "-"
    text = _display_text(text, locale)
    return escape(text).replace("\n", "<br/>")


def _labels(locale: str) -> dict[str, str]:
    if locale == "de":
        return {
            "title": "Projektvorschlag",
            "status": "Status",
            "customer": "Kunde",
            "contact": "Kontakt",
            "project": "Projekt",
            "summary": "Zusammenfassung",
            "sites": "Baustellen und Arbeitspakete",
            "workshops": "Externe Werkstaetten",
            "payments": "Zahlungsentwuerfe",
            "staffing": "Personalvorschlag",
            "company": "Firma",
            "phone": "Telefon",
            "email": "E-Mail",
            "address": "Adresse",
            "orderTitle": "Auftragstitel",
            "period": "Zeitraum",
            "hours": "Geschaetzte Stunden",
            "price": "Geschaetzter Preis",
            "currency": "Waehrung",
            "description": "Beschreibung",
            "skills": "Skills",
            "certifications": "Zertifikate",
            "siteHours": "Stunden",
            "headcount": "Empfohlene Mitarbeiterzahl",
            "coverage": "Abdeckung",
            "workshop": "Werkstatt",
            "workshopSkills": "Werkstatt deckt ab",
            "notes": "Notizen",
            "notMentioned": "Nicht erwaehnt",
            "generated": "Erstellt",
            "proposalId": "Proposal-ID",
            "type": "Typ",
            "amount": "Betrag",
            "date": "Datum",
            "method": "Methode",
            "team": "Vorgeschlagenes Team",
        }
    if locale == "ar":
        return {
            "title": "عرض مشروع",
            "status": "الحالة",
            "customer": "العميل",
            "contact": "جهة الاتصال",
            "project": "المشروع",
            "summary": "الملخص",
            "sites": "المواقع وحزم العمل",
            "workshops": "الورش الخارجية",
            "payments": "مسودات الدفعات",
            "staffing": "اقتراح التوظيف",
            "company": "الشركة",
            "phone": "الهاتف",
            "email": "البريد الإلكتروني",
            "address": "العنوان",
            "orderTitle": "عنوان الطلب",
            "period": "الفترة",
            "hours": "الساعات المقدرة",
            "price": "السعر التقديري",
            "currency": "العملة",
            "description": "الوصف",
            "skills": "المهارات",
            "certifications": "الشهادات",
            "siteHours": "الساعات",
            "headcount": "عدد الموظفين المقترح",
            "coverage": "نوع التغطية",
            "workshop": "الورشة",
            "workshopSkills": "المهارات التي تغطيها الورشة",
            "notes": "ملاحظات",
            "notMentioned": "غير مذكور",
            "generated": "تم الإنشاء",
            "proposalId": "معرف العرض",
            "type": "النوع",
            "amount": "المبلغ",
            "date": "التاريخ",
            "method": "طريقة الدفع",
            "team": "الفريق المقترح",
        }
    return {
        "title": "Project Proposal",
        "status": "Status",
        "customer": "Customer",
        "contact": "Contact",
        "project": "Project",
        "summary": "Summary",
        "sites": "Sites and Work Packages",
        "workshops": "External Workshops",
        "payments": "Payment Drafts",
        "staffing": "Staffing Suggestion",
        "company": "Company",
        "phone": "Phone",
        "email": "Email",
        "address": "Address",
        "orderTitle": "Order Title",
        "period": "Period",
        "hours": "Estimated Hours",
        "price": "Estimated Price",
        "currency": "Currency",
        "description": "Description",
        "skills": "Skills",
        "certifications": "Certifications",
        "siteHours": "Hours",
        "headcount": "Recommended Headcount",
        "coverage": "Coverage",
        "workshop": "Workshop",
        "workshopSkills": "Workshop Covers",
        "notes": "Notes",
        "notMentioned": "Not mentioned",
        "generated": "Generated",
        "proposalId": "Proposal ID",
        "type": "Type",
        "amount": "Amount",
        "date": "Date",
        "method": "Method",
        "team": "Suggested Team",
    }


def _is_rtl(locale: str) -> bool:
    return locale == "ar"


def _resolve_font_paths() -> tuple[Path, Path] | None:
    candidates = [
        (Path(r"C:\Windows\Fonts\tahoma.ttf"), Path(r"C:\Windows\Fonts\tahomabd.ttf")),
        (Path(r"C:\Windows\Fonts\arial.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            return regular, bold
    return None


def _font_names(locale: str) -> tuple[str, str]:
    if locale in _FONT_REGISTRY:
        return _FONT_REGISTRY[locale]
    regular_name = "Helvetica"
    bold_name = "Helvetica-Bold"
    if _is_rtl(locale):
        try:
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont

            paths = _resolve_font_paths()
            if paths:
                regular_path, bold_path = paths
                regular_name = "MiniERPProposalRegular"
                bold_name = "MiniERPProposalBold"
                if regular_name not in pdfmetrics.getRegisteredFontNames():
                    pdfmetrics.registerFont(TTFont(regular_name, str(regular_path)))
                if bold_name not in pdfmetrics.getRegisteredFontNames():
                    pdfmetrics.registerFont(TTFont(bold_name, str(bold_path)))
        except Exception:
            regular_name = "Helvetica"
            bold_name = "Helvetica-Bold"
    _FONT_REGISTRY[locale] = (regular_name, bold_name)
    return _FONT_REGISTRY[locale]


def _key_value_table(rows: list[tuple[str, str]], normal_style, bold_style, rtl: bool, locale: str = "en"):
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Table, TableStyle

    if rtl:
        col_widths = [130 * mm, 45 * mm]
        table_rows = [[Paragraph(value, normal_style), Paragraph(f"<b>{_paragraph_text(label, locale)}</b>", bold_style)] for label, value in rows]
    else:
        col_widths = [45 * mm, 130 * mm]
        table_rows = [[Paragraph(f"<b>{_paragraph_text(label, locale)}</b>", bold_style), Paragraph(value, normal_style)] for label, value in rows]
    table = Table(table_rows, colWidths=col_widths)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#d5dde5")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d5dde5")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def build_proposal_pdf(payload: Mapping[str, Any], locale: str = "en") -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    labels = _labels(locale)
    extra_labels = {
        "de": {
            "documentSubtitle": "Strukturierter Projektvorschlag fuer Ausfuehrung, Zahlung und Personalplanung",
            "overview": "Projektuebersicht",
            "commercial": "Kommerzielle Uebersicht",
            "scopeMatrix": "Leistungsuebersicht",
            "detailedScope": "Detaillierter Leistungsumfang",
            "execution": "Ausfuehrung",
            "selectedHeadcount": "Finale interne Anzahl",
            "remainingInternalSkills": "Verbleibende interne Skills",
            "warning": "Hinweis",
            "paymentStatus": "Status",
            "paidOrDue": "Faellig/bezahlt am",
            "remainingBalance": "Restbetrag",
            "amountPlanned": "Geplanter Betrag",
            "amountPaid": "Erfasste Zahlungen",
            "toConfirm": "Noch zu bestaetigen",
            "readyNote": "Dieser Vorschlag wurde aus dem AI Intake erzeugt und sollte vor Versand fachlich geprueft werden.",
            "page": "Seite",
        },
        "ar": {
            "documentSubtitle": "\u0639\u0631\u0636 \u0645\u0646\u0638\u0645 \u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0639\u0645\u0644 \u0648\u0627\u0644\u062f\u0641\u0639 \u0648\u0627\u0644\u062a\u0646\u0641\u064a\u0630 \u0648\u0627\u0644\u0641\u0631\u064a\u0642",
            "overview": "\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0645\u0634\u0631\u0648\u0639",
            "commercial": "\u0645\u0644\u062e\u0635 \u0645\u0627\u0644\u064a",
            "scopeMatrix": "\u0645\u0644\u062e\u0635 \u0646\u0637\u0627\u0642 \u0627\u0644\u0639\u0645\u0644",
            "detailedScope": "\u062a\u0641\u0627\u0635\u064a\u0644 \u0646\u0637\u0627\u0642 \u0627\u0644\u062a\u0646\u0641\u064a\u0630",
            "execution": "\u0627\u0644\u062a\u0646\u0641\u064a\u0630",
            "selectedHeadcount": "\u0627\u0644\u0639\u062f\u062f \u0627\u0644\u062f\u0627\u062e\u0644\u064a \u0627\u0644\u0646\u0647\u0627\u0626\u064a",
            "remainingInternalSkills": "\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a \u0627\u0644\u062f\u0627\u062e\u0644\u064a\u0629 \u0627\u0644\u0645\u062a\u0628\u0642\u064a\u0629",
            "warning": "\u062a\u0646\u0628\u064a\u0647",
            "paymentStatus": "\u062d\u0627\u0644\u0629 \u0627\u0644\u062f\u0641\u0639\u0629",
            "paidOrDue": "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062f\u0641\u0639 \u0623\u0648 \u0627\u0644\u0627\u0633\u062a\u062d\u0642\u0627\u0642",
            "remainingBalance": "\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0645\u062a\u0628\u0642\u064a",
            "amountPlanned": "\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u062a\u0642\u062f\u064a\u0631\u064a",
            "amountPaid": "\u0627\u0644\u062f\u0641\u0639\u0627\u062a \u0627\u0644\u0645\u0633\u062c\u0644\u0629",
            "toConfirm": "\u064a\u062d\u062a\u0627\u062c \u062a\u0623\u0643\u064a\u062f",
            "readyNote": "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636 \u0645\u0646 \u0645\u062d\u0627\u062f\u062b\u0629 \u0627\u0644\u0625\u062f\u062e\u0627\u0644 \u0627\u0644\u0630\u0643\u064a \u0648\u064a\u062c\u0628 \u0645\u0631\u0627\u062c\u0639\u062a\u0647 \u0642\u0628\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644.",
            "page": "\u0635\u0641\u062d\u0629",
        },
        "en": {
            "documentSubtitle": "Structured project proposal for scope, payment, execution, and staffing planning",
            "overview": "Project Overview",
            "commercial": "Commercial Summary",
            "scopeMatrix": "Scope Matrix",
            "detailedScope": "Detailed Scope of Work",
            "execution": "Execution",
            "selectedHeadcount": "Final Internal Count",
            "remainingInternalSkills": "Remaining Internal Skills",
            "warning": "Warning",
            "paymentStatus": "Payment Status",
            "paidOrDue": "Paid / Due Date",
            "remainingBalance": "Remaining Balance",
            "amountPlanned": "Planned Amount",
            "amountPaid": "Recorded Payments",
            "toConfirm": "To be confirmed",
            "readyNote": "This proposal was generated from the AI Intake and should be reviewed before sending.",
            "page": "Page",
        },
    }.get(locale, {})
    fallback = labels["notMentioned"]
    rtl = _is_rtl(locale)
    regular_font, bold_font = _font_names(locale)
    alignment = TA_RIGHT if rtl else TA_LEFT
    navy = colors.HexColor("#12344d")
    blue = colors.HexColor("#2563eb")
    light_blue = colors.HexColor("#eef5ff")
    border = colors.HexColor("#d6e0ea")
    muted = colors.HexColor("#52687a")
    soft = colors.HexColor("#f7fafc")

    def tr(key: str) -> str:
        return extra_labels.get(key) or labels.get(key) or key

    def pdf_text(value: Any) -> str:
        return _paragraph_text(value, locale)

    def P(value: Any, style) -> Paragraph:
        return Paragraph(pdf_text(value), style)

    def html(value: str, style) -> Paragraph:
        return Paragraph(value, style)

    def table_values(values: list[Any]) -> list[Any]:
        return list(reversed(values)) if rtl else values

    def date_text(value: Any) -> str:
        return _safe_text(value)[:10] or fallback

    def number_value(value: Any) -> float | None:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    def money(value: Any, currency: Any = None) -> str:
        number = _safe_number(value)
        if number == "-":
            return fallback
        currency_text = _safe_text(currency or payload.get("currency"))
        return f"{number} {currency_text}".strip()

    def section(title: str):
        return [Spacer(1, 7), P(title, section_style), Spacer(1, 3)]

    def styled_table(rows: list[list[Any]], col_widths: list[float], header: bool = False, compact: bool = False) -> Table:
        table = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0, hAlign="RIGHT" if rtl else "LEFT")
        commands = [
            ("BOX", (0, 0), (-1, -1), 0.8, border),
            ("INNERGRID", (0, 0), (-1, -1), 0.35, border),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4 if compact else 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4 if compact else 6),
            ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, soft]),
        ]
        if header:
            commands.extend([
                ("BACKGROUND", (0, 0), (-1, 0), navy),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ])
        table.setStyle(TableStyle(commands))
        return table

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=_safe_text(payload.get("orderTitle")) or labels["title"],
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ProposalTitle", parent=styles["Heading1"], fontName=bold_font, fontSize=21, leading=25, textColor=colors.white, alignment=alignment)
    subtitle_style = ParagraphStyle("ProposalSubtitle", parent=styles["Normal"], fontName=regular_font, fontSize=9.5, leading=12, textColor=colors.HexColor("#dbeafe"), alignment=alignment)
    section_style = ParagraphStyle("ProposalSection", parent=styles["Heading2"], fontName=bold_font, fontSize=12.5, leading=16, textColor=navy, spaceAfter=4, alignment=alignment)
    normal = ParagraphStyle("ProposalNormal", parent=styles["Normal"], fontName=regular_font, fontSize=9.2, leading=12.2, alignment=alignment, textColor=colors.HexColor("#1f2a37"))
    bold = ParagraphStyle("ProposalBold", parent=normal, fontName=bold_font)
    table_header = ParagraphStyle("ProposalTableHeader", parent=bold, textColor=colors.white, alignment=alignment)
    small = ParagraphStyle("ProposalSmall", parent=styles["Normal"], fontName=regular_font, fontSize=7.8, leading=9.6, textColor=muted, alignment=alignment)
    small_center = ParagraphStyle("ProposalSmallCenter", parent=small, alignment=TA_CENTER)
    card_label = ParagraphStyle("CardLabel", parent=small, fontName=bold_font, textColor=muted)
    card_value = ParagraphStyle("CardValue", parent=normal, fontName=bold_font, fontSize=11.5, leading=14, textColor=navy)
    callout = ParagraphStyle("Callout", parent=normal, backColor=light_blue, borderColor=border, borderWidth=0.6, borderPadding=7, leading=12.5)

    def H(value: Any) -> Paragraph:
        return P(value, table_header)

    def draw_page(canvas, doc_obj):
        canvas.saveState()
        width, _height = A4
        canvas.setFillColor(navy)
        canvas.rect(0, A4[1] - 9 * mm, width, 9 * mm, fill=True, stroke=False)
        canvas.setFillColor(colors.white)
        canvas.setFont(bold_font, 7.5)
        footer_title = _display_text(labels["title"], locale)
        if rtl:
            canvas.drawRightString(width - 14 * mm, A4[1] - 6 * mm, footer_title)
            canvas.drawString(14 * mm, A4[1] - 6 * mm, f"{_display_text(tr('page'), locale)} {doc_obj.page}")
        else:
            canvas.drawString(14 * mm, A4[1] - 6 * mm, footer_title)
            canvas.drawRightString(width - 14 * mm, A4[1] - 6 * mm, f"{tr('page')} {doc_obj.page}")
        canvas.setFillColor(muted)
        canvas.setFont(regular_font, 7)
        proposal_id = _safe_text(payload.get("id")) or fallback
        canvas.drawString(14 * mm, 7 * mm, f"{_safe_text(labels['proposalId'])}: {proposal_id}")
        canvas.restoreState()

    story: list[Any] = []

    status = _safe_text(payload.get("status")) or fallback
    generated = date_text(payload.get("updatedAt") or payload.get("createdAt"))
    hero_rows = [[
        P(labels["title"], title_style),
        P(f"{labels['status']}: {status}<br/>{labels['generated']}: {generated}", subtitle_style),
    ]] if not rtl else [[
        P(f"{labels['status']}: {status}<br/>{labels['generated']}: {generated}", subtitle_style),
        P(labels["title"], title_style),
    ]]
    hero = Table(hero_rows, colWidths=[118 * mm, 58 * mm], hAlign="RIGHT" if rtl else "LEFT")
    hero.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), navy),
        ("BOX", (0, 0), (-1, -1), 0, navy),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.extend([hero, Spacer(1, 5), P(tr("documentSubtitle"), small), Spacer(1, 8)])

    address_value = " ".join(part for part in [_safe_text(payload.get("customerStreet")), _safe_text(payload.get("customerZipCode")), _safe_text(payload.get("customerCity")), _safe_text(payload.get("customerCountry"))] if part)
    period_value = " - ".join(part for part in [date_text(payload.get("preferredStartDate")) if payload.get("preferredStartDate") else "", date_text(payload.get("preferredEndDate")) if payload.get("preferredEndDate") else ""] if part)
    estimated_price = number_value(payload.get("estimatedPrice"))
    payments = payload.get("paymentDrafts") if isinstance(payload.get("paymentDrafts"), list) else []
    paid_total = sum(number_value((p if isinstance(p, Mapping) else {}).get("amount")) or 0 for p in payments if isinstance(p, Mapping) and str(p.get("status") or "").lower() in {"received", "paid", "completed"})
    planned_total = sum(number_value((p if isinstance(p, Mapping) else {}).get("amount")) or 0 for p in payments if isinstance(p, Mapping))
    remaining = estimated_price - paid_total if estimated_price is not None else None

    overview_cards = table_values([
        [P(labels["customer"], card_label), P(_safe_text(payload.get("customerCompanyName")) or fallback, card_value)],
        [P(labels["period"], card_label), P(period_value or fallback, card_value)],
        [P(labels["hours"], card_label), P(_safe_number(payload.get("estimatedHours")), card_value)],
        [P(labels["price"], card_label), P(money(payload.get("estimatedPrice")), card_value)],
    ])
    cards = Table([overview_cards], colWidths=[44 * mm] * 4)
    cards.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), light_blue),
        ("BOX", (0, 0), (-1, -1), 0.8, border),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, border),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend(section(tr("overview")))
    story.append(cards)
    story.append(Spacer(1, 8))

    customer_rows = [
        table_values([P(labels["company"], bold), P(_safe_text(payload.get("customerCompanyName")) or fallback, normal)]),
        table_values([P(labels["contact"], bold), P(_safe_text(payload.get("contactName")) or fallback, normal)]),
        table_values([P(labels["phone"], bold), P(_safe_text(payload.get("contactPhone")) or fallback, normal)]),
        table_values([P(labels["email"], bold), P(_safe_text(payload.get("contactEmail")) or fallback, normal)]),
        table_values([P(labels["address"], bold), P(address_value or fallback, normal)]),
    ]
    project_rows = [
        table_values([P(labels["orderTitle"], bold), P(_safe_text(payload.get("orderTitle")) or fallback, normal)]),
        table_values([P(labels["period"], bold), P(period_value or fallback, normal)]),
        table_values([P(labels["description"], bold), P(payload.get("orderDescription") or fallback, normal)]),
    ]
    two_col = Table([[styled_table(customer_rows, [37 * mm, 48 * mm], compact=True), styled_table(project_rows, [37 * mm, 48 * mm], compact=True)]], colWidths=[87 * mm, 87 * mm])
    two_col.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 5)]))
    if rtl:
        two_col = Table([[styled_table(project_rows, [48 * mm, 37 * mm], compact=True), styled_table(customer_rows, [48 * mm, 37 * mm], compact=True)]], colWidths=[87 * mm, 87 * mm])
        two_col.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(two_col)
    summary_card = Table(
        [
            [H(labels["summary"])],
            [P(payload.get("summary") or payload.get("orderDescription") or fallback, normal)],
        ],
        colWidths=[176 * mm],
        hAlign="RIGHT" if rtl else "LEFT",
    )
    summary_card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("BACKGROUND", (0, 1), (-1, 1), light_blue),
        ("BOX", (0, 0), (-1, -1), 0.8, border),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 1), (-1, 1), 9),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
    ]))
    story.extend([Spacer(1, 10), summary_card, Spacer(1, 16)])

    sites = payload.get("proposedSites") if isinstance(payload.get("proposedSites"), list) else []
    recommended_team = payload.get("recommendedTeam") if isinstance(payload.get("recommendedTeam"), Mapping) else {}
    recommended_sites: dict[int, Mapping[str, Any]] = {}
    for site_rec in recommended_team.get("sites", []) if isinstance(recommended_team.get("sites"), list) else []:
        if isinstance(site_rec, Mapping):
            try:
                recommended_sites[int(site_rec.get("siteIndex", 0))] = site_rec
            except (TypeError, ValueError):
                continue

    story.extend(section(tr("scopeMatrix")))
    if sites:
        headings = table_values([H(labels["sites"]), H(labels["skills"]), H(labels["coverage"]), H(labels["siteHours"])])
        rows = [headings]
        for index, site in enumerate(sites, start=1):
            site_map = site if isinstance(site, Mapping) else {}
            rec_map = recommended_sites.get(index - 1, {})
            rows.append(table_values([
                P(f"{index}. {_safe_text(site_map.get('siteName')) or fallback}", normal),
                P(_list_text(site_map.get("requiredSkills")), normal),
                P(_safe_text(site_map.get("coverageType") or rec_map.get("coverageType") or fallback), normal),
                P(_safe_number(site_map.get("estimatedHours") or rec_map.get("estimatedHours")), normal),
            ]))
        story.append(styled_table(rows, [58 * mm, 58 * mm, 40 * mm, 20 * mm], header=True, compact=True))
    else:
        story.append(P(fallback, normal))

    story.extend(section(tr("detailedScope")))
    if sites:
        for index, site in enumerate(sites, start=1):
            site_map = site if isinstance(site, Mapping) else {}
            rec_map = recommended_sites.get(index - 1, {})
            site_title = f"{index}. {_safe_text(site_map.get('siteName')) or fallback}"
            selected_names: list[str] = []
            selected_ids = set(str(value) for value in rec_map.get("autoSelectedEmployeeIds", []) if value)
            candidate_lists = []
            if isinstance(rec_map.get("recommendations"), list):
                candidate_lists.append(rec_map.get("recommendations"))
            if isinstance(rec_map.get("recommendedTeam"), list):
                candidate_lists.append(rec_map.get("recommendedTeam"))
            for candidate_list in candidate_lists:
                for employee in candidate_list:
                    if not isinstance(employee, Mapping):
                        continue
                    employee_id = _safe_text(employee.get("employeeId"))
                    name = _safe_text(employee.get("employeeName"))
                    if name and (not selected_ids or employee_id in selected_ids or candidate_list is rec_map.get("recommendedTeam")):
                        selected_names.append(name)
            detail_rows = [
                table_values([P(labels["notes"], bold), P(site_map.get("notes") or rec_map.get("coverageNote") or fallback, normal)]),
                table_values([P(labels["skills"], bold), P(_list_text(site_map.get("requiredSkills")), normal)]),
                table_values([P(labels["certifications"], bold), P(_list_text(site_map.get("requiredCertifications")), normal)]),
                table_values([P(labels["coverage"], bold), P(_safe_text(site_map.get("coverageType") or rec_map.get("coverageType") or fallback), normal)]),
                table_values([P(labels["workshop"], bold), P(_safe_text(site_map.get("assignedWorkshopName") or (rec_map.get("workshopSummary") or {}).get("name") if isinstance(rec_map.get("workshopSummary"), Mapping) else "") or fallback, normal)]),
                table_values([P(labels["workshopSkills"], bold), P(_list_text(site_map.get("workshopCoveredSkills") or ((rec_map.get("workshopSummary") or {}).get("coveredSkills") if isinstance(rec_map.get("workshopSummary"), Mapping) else [])), normal)]),
                table_values([P(labels["headcount"], bold), P(_safe_number(rec_map.get("recommendedHeadcount") if rec_map else site_map.get("recommendedHeadcount")), normal)]),
                table_values([P(tr("selectedHeadcount"), bold), P(_safe_number(site_map.get("selectedInternalHeadcount") or rec_map.get("selectedInternalHeadcount")), normal)]),
                table_values([P(tr("remainingInternalSkills"), bold), P(_list_text(rec_map.get("internalRequiredSkills")), normal)]),
                table_values([P(labels["team"], bold), P(", ".join(dict.fromkeys(selected_names)) if selected_names else fallback, normal)]),
            ]
            warning = _safe_text(rec_map.get("staffingWarning"))
            if warning:
                detail_rows.append(table_values([P(tr("warning"), bold), P(warning, normal)]))
            title_table = Table([[P(site_title, bold)]], colWidths=[176 * mm])
            title_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), light_blue),
                ("BOX", (0, 0), (-1, -1), 0.8, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.extend([KeepTogether([title_table, styled_table(detail_rows, [50 * mm, 126 * mm] if not rtl else [126 * mm, 50 * mm], compact=True)]), Spacer(1, 7)])
    else:
        story.append(P(fallback, normal))

    story.extend(section(labels["workshops"]))
    workshops = payload.get("externalWorkshops") if isinstance(payload.get("externalWorkshops"), list) else []
    if workshops:
        headings = table_values([H(labels["workshop"]), H(labels["contact"]), H(labels["skills"]), H(labels["notes"])])
        rows = [headings]
        for workshop in workshops:
            workshop_map = workshop if isinstance(workshop, Mapping) else {}
            contact = ", ".join(part for part in [_safe_text(workshop_map.get("contactName")), _safe_text(workshop_map.get("phone")), _safe_text(workshop_map.get("email"))] if part) or fallback
            rows.append(table_values([
                P(_safe_text(workshop_map.get("name")) or fallback, normal),
                P(contact, normal),
                P(_list_text(workshop_map.get("specialties")), normal),
                P(_safe_text(workshop_map.get("notes")) or fallback, normal),
            ]))
        story.append(styled_table(rows, [42 * mm, 45 * mm, 45 * mm, 44 * mm], header=True, compact=True))
    else:
        story.append(P(fallback, normal))

    story.extend(section(labels["payments"]))
    commercial_cards = table_values([
        [P(tr("amountPlanned"), card_label), P(money(payload.get("estimatedPrice")), card_value)],
        [P(tr("amountPaid"), card_label), P(money(paid_total if paid_total else planned_total, payload.get("currency")), card_value)],
        [P(tr("remainingBalance"), card_label), P(money(remaining, payload.get("currency")) if remaining is not None else fallback, card_value)],
    ])
    commercial_table = Table([commercial_cards], colWidths=[58.6 * mm] * 3)
    commercial_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fbff")),
        ("BOX", (0, 0), (-1, -1), 0.8, border),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(commercial_table)
    story.append(Spacer(1, 6))
    if payments:
        headings = table_values([H(labels["type"]), H(tr("paymentStatus")), H(labels["amount"]), H(tr("paidOrDue")), H(labels["method"]), H(labels["notes"])])
        rows = [headings]
        for payment in payments:
            payment_map = payment if isinstance(payment, Mapping) else {}
            amount_text = money(payment_map.get("amount"), payment_map.get("currency"))
            rows.append(table_values([
                P(_safe_text(payment_map.get("type")) or fallback, normal),
                P(_safe_text(payment_map.get("status")) or fallback, normal),
                P(amount_text, normal),
                P(date_text(payment_map.get("paidDate") or payment_map.get("dueDate")), normal),
                P(_safe_text(payment_map.get("method")) or fallback, normal),
                P(_safe_text(payment_map.get("notes")) or fallback, normal),
            ]))
        story.append(styled_table(rows, [28 * mm, 28 * mm, 30 * mm, 32 * mm, 28 * mm, 30 * mm], header=True, compact=True))
    else:
        story.append(P(fallback, normal))

    story.extend(section(labels["staffing"]))
    staffing_rows: list[list[Any]] = []
    staffing_head = table_values([H(labels["sites"]), H(labels["headcount"]), H(tr("selectedHeadcount")), H(labels["team"]), H(tr("warning"))])
    staffing_rows.append(staffing_head)
    for site_rec in recommended_team.get("sites", []) if isinstance(recommended_team.get("sites"), list) else []:
        if not isinstance(site_rec, Mapping):
            continue
        selected: list[str] = []
        selected_ids = set(str(value) for value in site_rec.get("autoSelectedEmployeeIds", []) if value)
        source = site_rec.get("recommendations") if isinstance(site_rec.get("recommendations"), list) else site_rec.get("recommendedTeam")
        for employee in source if isinstance(source, list) else []:
            if isinstance(employee, Mapping):
                employee_id = _safe_text(employee.get("employeeId"))
                name = _safe_text(employee.get("employeeName"))
                if name and (not selected_ids or employee_id in selected_ids or source is site_rec.get("recommendedTeam")):
                    selected.append(name)
        staffing_rows.append(table_values([
            P(_safe_text(site_rec.get("siteName")) or fallback, normal),
            P(_safe_number(site_rec.get("recommendedHeadcount")), normal),
            P(_safe_number(site_rec.get("selectedInternalHeadcount")), normal),
            P(", ".join(dict.fromkeys(selected)) if selected else fallback, normal),
            P(_safe_text(site_rec.get("staffingWarning")) or fallback, normal),
        ]))
    if len(staffing_rows) > 1:
        story.append(styled_table(staffing_rows, [42 * mm, 25 * mm, 30 * mm, 50 * mm, 29 * mm], header=True, compact=True))
    else:
        story.append(P(fallback, normal))

    confirmations: list[str] = []
    if any(isinstance(site, Mapping) and not _safe_text(site.get("notes")) for site in sites):
        confirmations.append(f"{labels['notes']}: {tr('toConfirm')}")
    if remaining is None and _safe_text(payload.get("estimatedPrice")) == "":
        confirmations.append(f"{labels['price']}: {tr('toConfirm')}")
    if not payments:
        confirmations.append(f"{labels['payments']}: {tr('toConfirm')}")
    if confirmations:
        story.extend(section(tr("toConfirm")))
        for item in confirmations:
            story.append(P(f"- {item}", normal))
            story.append(Spacer(1, 2))

    story.extend([Spacer(1, 8), P(tr("readyNote"), small_center)])
    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    return buffer.getvalue()

