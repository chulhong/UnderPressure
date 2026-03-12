"""Generate PDF reports with summary table (ReportLab)."""

from datetime import date, datetime, timedelta
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from .storage import get_by_date_range
from .settings import get_settings


# Theme colors (teal/slate to match app)
HEADER_BG = colors.HexColor("#0d9488")
HEADER_TEXT = colors.white
SECTION_TITLE = colors.HexColor("#0f172a")
BODY_TEXT = colors.HexColor("#334155")
WEEK_ROW_BG = colors.HexColor("#f1f5f9")
GRID = colors.HexColor("#e2e8f0")


def _week_start(d: date) -> date:
    """Monday of the week containing d."""
    return d - timedelta(days=d.weekday())


def _format_bp(sbp, dbp):
    if sbp is not None and dbp is not None:
        return f"{sbp} / {dbp}"
    if sbp is not None:
        return f"{sbp} / —"
    if dbp is not None:
        return f"— / {dbp}"
    return "—"


def _avg(values: list) -> float | None:
    nums = [v for v in values if v is not None]
    if not nums:
        return None
    return sum(nums) / len(nums)


def _format_device(device: str | None) -> str:
    """Return device string; empty if None, empty, or 'unknown'."""
    if not device or not str(device).strip():
        return ""
    if str(device).strip().lower() == "unknown":
        return ""
    return str(device).strip()


def _compute_summary_stats(records: list, sbp_high: int = 135, dbp_high: int = 85) -> dict:
    """Compute summary statistics from records for the doctor summary section."""
    all_sbp = []
    all_dbp = []
    morning_sbp = []
    morning_dbp = []
    evening_sbp = []
    evening_dbp = []
    high_count = 0
    reading_count = 0
    for r in records:
        for sbp, dbp in [(r.morning_sbp, r.morning_dbp), (r.evening_sbp, r.evening_dbp)]:
            if sbp is not None:
                all_sbp.append(sbp)
                reading_count += 1
                if sbp >= sbp_high:
                    high_count += 1
            if dbp is not None:
                all_dbp.append(dbp)
                if dbp >= dbp_high:
                    high_count += 1
        if r.morning_sbp is not None:
            morning_sbp.append(r.morning_sbp)
        if r.morning_dbp is not None:
            morning_dbp.append(r.morning_dbp)
        if r.evening_sbp is not None:
            evening_sbp.append(r.evening_sbp)
        if r.evening_dbp is not None:
            evening_dbp.append(r.evening_dbp)
    total_readings = len(all_sbp) + len(all_dbp)
    pct_high = round(100 * high_count / total_readings) if total_readings else 0
    return {
        "days_with_data": len(records),
        "total_readings": total_readings,
        "avg_sbp": round(_avg(all_sbp), 1) if all_sbp else None,
        "avg_dbp": round(_avg(all_dbp), 1) if all_dbp else None,
        "min_sbp": min(all_sbp) if all_sbp else None,
        "max_sbp": max(all_sbp) if all_sbp else None,
        "min_dbp": min(all_dbp) if all_dbp else None,
        "max_dbp": max(all_dbp) if all_dbp else None,
        "pct_elevated": pct_high,
        "morning_avg_sbp": round(_avg(morning_sbp), 1) if morning_sbp else None,
        "morning_avg_dbp": round(_avg(morning_dbp), 1) if morning_dbp else None,
        "evening_avg_sbp": round(_avg(evening_sbp), 1) if evening_sbp else None,
        "evening_avg_dbp": round(_avg(evening_dbp), 1) if evening_dbp else None,
    }


def build_report(from_date: date, to_date: date) -> bytes:
    """Build PDF report for date range (summary table with weekly averages)."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.8 * cm,
        leftMargin=1.8 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
    )
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=22,
        textColor=SECTION_TITLE,
        spaceAfter=6,
        spaceBefore=0,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=11,
        textColor=BODY_TEXT,
        spaceAfter=20,
    )
    h2_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=14,
        textColor=SECTION_TITLE,
        spaceBefore=14,
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=10,
        textColor=BODY_TEXT,
    )
    header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontSize=10,
        textColor=HEADER_TEXT,
        fontName="Helvetica-Bold",
        alignment=1,  # center
    )

    body = []

    body.append(Paragraph("Blood Pressure Report", title_style))
    body.append(Paragraph(
        f"Period: {from_date.strftime('%d %b %Y')} – {to_date.strftime('%d %b %Y')}",
        subtitle_style,
    ))
    body.append(Paragraph(
        f"Report generated: {datetime.now().strftime('%d %b %Y')} · Home/self-measured readings",
        ParagraphStyle("ReportMeta", parent=body_style, fontSize=9, textColor=BODY_TEXT, spaceAfter=16),
    ))

    records = get_by_date_range(from_date, to_date)
    if not records:
        body.append(Paragraph("No data in this range.", body_style))
    else:
        settings = get_settings()
        sbp_high = settings.get("sbp_high", 135)
        dbp_high = settings.get("dbp_high", 85)
        stats = _compute_summary_stats(records, sbp_high=sbp_high, dbp_high=dbp_high)

        # At a glance: summary for the doctor
        body.append(Paragraph("Summary for doctor", h2_style))
        summary_para = ParagraphStyle(
            "SummaryCell",
            parent=body_style,
            fontSize=10,
            textColor=BODY_TEXT,
            leftIndent=0,
            rightIndent=0,
        )
        days_in_period = (to_date - from_date).days + 1
        summary_rows = [
            [Paragraph("Days in the period", summary_para), Paragraph(str(days_in_period), summary_para)],
            [Paragraph("Days with readings", summary_para), Paragraph(str(stats["days_with_data"]), summary_para)],
            [Paragraph("Total BP readings (SBP+DBP points)", summary_para), Paragraph(str(stats["total_readings"]), summary_para)],
            [
                Paragraph("Average BP (all readings)", summary_para),
                Paragraph(
                    f"{stats['avg_sbp']} / {stats['avg_dbp']} mmHg" if stats["avg_sbp"] is not None and stats["avg_dbp"] is not None else "—",
                    summary_para,
                ),
            ],
            [
                Paragraph("Morning average", summary_para),
                Paragraph(
                    f"{stats['morning_avg_sbp']} / {stats['morning_avg_dbp']}" if stats["morning_avg_sbp"] is not None and stats["morning_avg_dbp"] is not None else "—",
                    summary_para,
                ),
            ],
            [
                Paragraph("Evening average", summary_para),
                Paragraph(
                    f"{stats['evening_avg_sbp']} / {stats['evening_avg_dbp']}" if stats["evening_avg_sbp"] is not None and stats["evening_avg_dbp"] is not None else "—",
                    summary_para,
                ),
            ],
            [
                Paragraph("SBP range (min–max)", summary_para),
                Paragraph(f"{stats['min_sbp']} – {stats['max_sbp']} mmHg" if stats["min_sbp"] is not None else "—", summary_para),
            ],
            [
                Paragraph("DBP range (min–max)", summary_para),
                Paragraph(f"{stats['min_dbp']} – {stats['max_dbp']} mmHg" if stats["min_dbp"] is not None else "—", summary_para),
            ],
            [
                Paragraph(f"Readings ≥{sbp_high}/{dbp_high} mmHg", summary_para),
                Paragraph(f"{stats['pct_elevated']}% of readings", summary_para),
            ],
        ]
        summary_table = Table(summary_rows, colWidths=[6.2 * cm, 5.8 * cm])
        summary_table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (-1, -1), BODY_TEXT),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
            ("GRID", (0, 0), (-1, -1), 0.5, GRID),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        body.append(summary_table)
        body.append(Spacer(1, 0.5 * cm))
        body.append(Paragraph(
            f"<i>Note: Home monitoring. Values ≥{sbp_high}/{dbp_high} mmHg may indicate elevated BP; refer to current clinical guidelines.</i>",
            ParagraphStyle("Disclaimer", parent=body_style, fontSize=9, textColor=BODY_TEXT, spaceAfter=12),
        ))
        body.append(Spacer(1, 0.2 * cm))

        by_week: dict[date, list] = {}
        for r in records:
            ws = _week_start(r.date)
            by_week.setdefault(ws, []).append(r)

        # Daily detail table (daily rows + weekly average row after each week)
        body.append(Paragraph("Daily detail", h2_style))
        body.append(Spacer(1, 0.4 * cm))
        daily_data = [
            [
                "Date",
                Paragraph("Morning<br/>(SBP/DBP)", header_style),
                Paragraph("Evening<br/>(SBP/DBP)", header_style),
                "Device",
                "Note",
            ]
        ]
        daily_style = [
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_TEXT),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TOPPADDING", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, GRID),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]
        data_row = 1
        for week_start in sorted(by_week.keys()):
            week_records = by_week[week_start]
            for r in week_records:
                daily_data.append([
                    r.date.strftime("%Y-%m-%d"),
                    _format_bp(r.morning_sbp, r.morning_dbp),
                    _format_bp(r.evening_sbp, r.evening_dbp),
                    _format_device(r.device),
                    (r.note or "")[:50],
                ])
                data_row += 1
            m_sbp = _avg([r.morning_sbp for r in week_records])
            m_dbp = _avg([r.morning_dbp for r in week_records])
            e_sbp = _avg([r.evening_sbp for r in week_records])
            e_dbp = _avg([r.evening_dbp for r in week_records])
            daily_data.append([
                f"{week_start.isoformat()} (avg)",
                _format_bp(round(m_sbp, 1) if m_sbp is not None else None, round(m_dbp, 1) if m_dbp is not None else None),
                _format_bp(round(e_sbp, 1) if e_sbp is not None else None, round(e_dbp, 1) if e_dbp is not None else None),
                "",
                "",
            ])
            daily_style.append(("BACKGROUND", (0, data_row), (-1, data_row), WEEK_ROW_BG))
            daily_style.append(("FONTNAME", (0, data_row), (-1, data_row), "Helvetica-Bold"))
            data_row += 1
        col_widths = [3.2 * cm, 3.4 * cm, 3.4 * cm, 2.8 * cm, 4.0 * cm]
        t_daily = Table(daily_data, colWidths=col_widths)
        t_daily.setStyle(TableStyle(daily_style))
        body.append(t_daily)
        body.append(Spacer(1, 0.8 * cm))

        # Weekly average table (only weekly rows)
        body.append(Paragraph("Weekly average", h2_style))
        body.append(Spacer(1, 0.4 * cm))
        weekly_data = [
            [
                "Week",
                Paragraph("Morning<br/>(SBP/DBP)", header_style),
                Paragraph("Evening<br/>(SBP/DBP)", header_style),
            ]
        ]
        for week_start in sorted(by_week.keys()):
            week_records = by_week[week_start]
            m_sbp = _avg([r.morning_sbp for r in week_records])
            m_dbp = _avg([r.morning_dbp for r in week_records])
            e_sbp = _avg([r.evening_sbp for r in week_records])
            e_dbp = _avg([r.evening_dbp for r in week_records])
            weekly_data.append([
                week_start.isoformat(),
                _format_bp(round(m_sbp, 1) if m_sbp is not None else None, round(m_dbp, 1) if m_dbp is not None else None),
                _format_bp(round(e_sbp, 1) if e_sbp is not None else None, round(e_dbp, 1) if e_dbp is not None else None),
            ])
        col_widths_weekly = [4.5 * cm, 4.5 * cm, 4.5 * cm]
        t_weekly = Table(weekly_data, colWidths=col_widths_weekly)
        t_weekly.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_TEXT),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TOPPADDING", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, GRID),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        body.append(t_weekly)

    doc.build(body)
    return buffer.getvalue()
