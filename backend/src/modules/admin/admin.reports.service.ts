import { AppError } from '../../shared/errors.js';
import * as repository from './admin.reports.repository.js';
import type { ReportRow } from './admin.reports.repository.js';
import type {
  GenerateReportInput,
  ListReportsInput,
  ReportDto,
  ReportExportDto,
  ReportPageDto,
} from './admin.types.js';

function toReportDto(row: ReportRow): ReportDto {
  return {
    id: row.id,
    type: row.report_type,
    periodStart: row.period_start.toISOString(),
    periodEnd: row.period_end.toISOString(),
    rowCount: row.row_count,
    generatedBy:
      row.generated_by === null
        ? null
        : { id: row.generated_by, name: row.generated_by_name },
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Neutraliza la inyección de fórmulas en CSV: Excel interpreta como fórmula
 * cualquier celda que empiece por =, +, -, @, tabulador o retorno de carro.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let text = value instanceof Date ? value.toISOString() : String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

async function buildReportCsv(
  input: GenerateReportInput,
): Promise<{ csv: string; rowCount: number }> {
  if (input.type === 'users') {
    const rows = await repository.listUsersForPeriod(input.from, input.to);
    const csv = buildCsv(
      [
        'ID',
        'Nombre',
        'Correo',
        'Teléfono',
        'Localidad',
        'Rol',
        'Estado',
        'Fecha de registro',
        'Perfil completo',
      ],
      rows.map((row) => [
        row.id,
        row.name,
        row.email,
        row.phone,
        row.locality,
        row.role,
        row.state,
        row.register_date,
        row.profile_completed_at === null ? 'No' : 'Sí',
      ]),
    );
    return { csv, rowCount: rows.length };
  }

  if (input.type === 'matches') {
    const rows = await repository.listMatchesForPeriod(input.from, input.to);
    const csv = buildCsv(
      [
        'ID',
        'Organizador ID',
        'Organizador',
        'Correo del organizador',
        'Fecha del partido',
        'Localidad',
        'Modalidad',
        'Descripción',
        'Estado',
        'Moderación',
        'Fecha de publicación',
      ],
      rows.map((row) => [
        row.id,
        row.creator_id,
        row.creator_name,
        row.creator_email,
        row.match_date,
        row.locality,
        row.modality,
        row.description,
        row.state,
        row.moderation_state,
        row.created_at,
      ]),
    );
    return { csv, rowCount: rows.length };
  }

  const rows = await repository.listRequestsForPeriod(input.from, input.to);
  const csv = buildCsv(
    [
      'ID',
      'Tipo',
      'Estado',
      'Remitente ID',
      'Remitente',
      'Correo del remitente',
      'Destinatario ID',
      'Destinatario',
      'Correo del destinatario',
      'Partido ID',
      'Fecha de envío',
      'Fecha de respuesta',
      'Fecha de aceptación',
      'Fecha de cancelación',
    ],
    rows.map((row) => [
      row.id,
      row.request_type,
      row.state,
      row.sender_id,
      row.sender_name,
      row.sender_email,
      row.receiver_id,
      row.receiver_name,
      row.receiver_email,
      row.match_id,
      row.created_at,
      row.responded_at,
      row.accepted_at,
      row.cancelled_at,
    ]),
  );
  return { csv, rowCount: rows.length };
}

export async function generateReport(
  input: GenerateReportInput,
  adminId: number,
): Promise<ReportDto> {
  const { csv, rowCount } = await buildReportCsv(input);
  const row = await repository.insertReport({
    type: input.type,
    from: input.from,
    to: input.to,
    rowCount,
    csv,
    generatedBy: adminId,
  });

  return toReportDto(row);
}

export async function listReports(
  input: ListReportsInput,
): Promise<ReportPageDto> {
  const filters: repository.ReportFilters = {
    type: input.type,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };

  const [rows, total] = await Promise.all([
    repository.listReports(filters),
    repository.countReports(filters),
  ]);

  return {
    reports: rows.map(toReportDto),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export async function exportReport(id: number): Promise<ReportExportDto> {
  const [report, csv] = await Promise.all([
    repository.findReportById(id),
    repository.findReportCsv(id),
  ]);

  if (!report || csv === null) {
    throw new AppError(
      404,
      'REPORT_NOT_FOUND',
      'No existe el reporte indicado',
    );
  }

  return {
    report: toReportDto(report),
    csv,
    filename: `futlink-reporte-${report.report_type}-${report.id}.csv`,
  };
}
