import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../src/config/db.js';

afterAll(async () => {
  await closePool();
});

describe('Esquema migrado', () => {
  beforeAll(async () => {
    const reg = await query<{ reg: string | null }>(
      `SELECT to_regclass('public.schema_migrations')::text AS reg`,
    );
    if (!reg.rows[0]?.reg) {
      throw new Error('Ejecuta npm run db:migrate antes de correr las pruebas.');
    }
  });

  it('tiene aplicadas las migraciones 0001 a 0010', async () => {
    const result = await query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect(result.rows.map((row) => row.version)).toEqual(
      expect.arrayContaining([
        '0001',
        '0002',
        '0003',
        '0004',
        '0005',
        '0006',
        '0007',
        '0008',
        '0009',
        '0010',
      ]),
    );
  });

  it('positions tiene PK e id generado automáticamente', async () => {
    const result = await query<{ has_pk: boolean; is_identity: string | null }>(`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'positions'::regclass AND contype = 'p'
        ) AS has_pk,
        (
          SELECT is_identity FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'id'
        ) AS is_identity
    `);

    expect(result.rows[0]?.has_pk).toBe(true);
    expect(result.rows[0]?.is_identity).toBe('YES');
  });

  it('users.password admite un hash bcrypt', async () => {
    const result = await query<{ max_length: number | null }>(`
      SELECT character_maximum_length::int AS max_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password'
    `);

    expect(result.rows[0]?.max_length).toBeGreaterThanOrEqual(60);
  });

  it('users.birthdate es opcional', async () => {
    const result = await query<{ is_nullable: string }>(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'birthdate'
    `);

    expect(result.rows[0]?.is_nullable).toBe('YES');
  });

  it('el correo es único sin distinguir mayúsculas', async () => {
    const result = await query<{ indexdef: string }>(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'users' AND indexname = 'users_email_lower_key'
    `);

    expect(result.rows[0]?.indexdef).toContain('lower');
  });

  it('valida roles y estados de usuario', async () => {
    const result = await query<{ conname: string }>(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'users'::regclass AND conname = ANY($1::text[])
    `, [['users_role_check', 'users_state_check']]);

    expect(result.rows.map((row) => row.conname).sort()).toEqual([
      'users_role_check',
      'users_state_check',
    ]);
  });

  it('crea las tablas de refresh tokens y códigos de recuperación', async () => {
    const result = await query<{
      refresh_tokens: string | null;
      password_reset_codes: string | null;
      profile_completed_at: string | null;
    }>(`
      SELECT
        to_regclass('public.refresh_tokens')::text AS refresh_tokens,
        to_regclass('public.password_reset_codes')::text AS password_reset_codes,
        (
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = 'profile_completed_at'
        ) AS profile_completed_at
    `);

    expect(result.rows[0]?.refresh_tokens).toBe('refresh_tokens');
    expect(result.rows[0]?.password_reset_codes).toBe('password_reset_codes');
    expect(result.rows[0]?.profile_completed_at).toBe('profile_completed_at');
  });

  it('crea los índices de apoyo del perfil (RF-03, RF-09)', async () => {
    const result = await query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY($1::text[])
    `, [[
      'usersratings_player_created_idx',
      'requests_sender_id_idx',
      'requests_matchvacant_id_idx',
      'matchvacants_match_id_idx',
      'matchs_creator_id_idx',
    ]]);

    expect(result.rows.map((row) => row.indexname).sort()).toEqual([
      'matchs_creator_id_idx',
      'matchvacants_match_id_idx',
      'requests_matchvacant_id_idx',
      'requests_sender_id_idx',
      'usersratings_player_created_idx',
    ]);

    const ratingsIndex = result.rows.find(
      (row) => row.indexname === 'usersratings_player_created_idx',
    );
    expect(ratingsIndex?.indexdef).toContain('(player_id, created_at DESC)');
    expect(ratingsIndex?.indexdef).toContain('INCLUDE (score, comment)');
  });

  it('amplía partidos y permite cancelar solicitudes (0005)', async () => {
    const columns = await query<{ column_name: string; is_nullable: string }>(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'matchs'
        AND column_name = ANY($1::text[])
      ORDER BY column_name
    `, [['modality', 'description', 'created_at', 'updated_at', 'cancelled_at']]);

    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'cancelled_at',
      'created_at',
      'description',
      'modality',
      'updated_at',
    ]);
    expect(columns.rows.find((row) => row.column_name === 'created_at')?.is_nullable).toBe('NO');
    expect(columns.rows.find((row) => row.column_name === 'cancelled_at')?.is_nullable).toBe('YES');

    const matchState = await query<{ column_default: string | null }>(`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'matchs' AND column_name = 'state'
    `);
    expect(matchState.rows[0]?.column_default).toContain('available');

    const checks = await query<{ conname: string; def: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid IN ('matchs'::regclass, 'requests'::regclass)
        AND conname IN ('matchs_state_check', 'requests_state_check')
    `);
    const byName = new Map(checks.rows.map((row) => [row.conname, row.def]));
    expect(byName.get('matchs_state_check')).toContain('cancelled');
    expect(byName.get('matchs_state_check')).toContain('available');
    expect(byName.get('requests_state_check')).toContain('cancelled');

    const indexes = await query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
      ORDER BY indexname
    `, [[
      'matchs_available_date_idx',
      'matchs_locality_date_idx',
      'matchs_location_gist_idx',
      'matchvacants_free_position_idx',
    ]]);

    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'matchs_available_date_idx',
      'matchs_locality_date_idx',
      'matchs_location_gist_idx',
      'matchvacants_free_position_idx',
    ]);
    expect(
      indexes.rows.find((row) => row.indexname === 'matchs_location_gist_idx')?.indexdef,
    ).toContain('USING gist');
  });

  it('crea los índices de búsqueda de jugadores (0006)', async () => {
    const result = await query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY($1::text[])
      ORDER BY indexname
    `, [['users_locality_active_idx', 'userspositions_position_user_idx']]);

    expect(result.rows.map((row) => row.indexname)).toEqual([
      'users_locality_active_idx',
      'userspositions_position_user_idx',
    ]);

    const localityIndex = result.rows.find(
      (row) => row.indexname === 'users_locality_active_idx',
    );
    expect(localityIndex?.indexdef).toContain('(locality)');
    expect(localityIndex?.indexdef).toContain('profile_completed_at IS NOT NULL');
    expect(localityIndex?.indexdef).toContain("state = 'active'");

    const positionsIndex = result.rows.find(
      (row) => row.indexname === 'userspositions_position_user_idx',
    );
    expect(positionsIndex?.indexdef).toContain('(id_positions, id_users)');
  });

  it('permite cuentas sin perfil completo y un password más largo', async () => {
    const result = await query<{
      name_nullable: string;
      locality_nullable: string;
      password_length: number;
    }>(`
      SELECT
        max(CASE WHEN column_name = 'name' THEN is_nullable END) AS name_nullable,
        max(CASE WHEN column_name = 'locality' THEN is_nullable END) AS locality_nullable,
        max(CASE WHEN column_name = 'password' THEN character_maximum_length END)::int
          AS password_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
    `);

    expect(result.rows[0]?.name_nullable).toBe('YES');
    expect(result.rows[0]?.locality_nullable).toBe('YES');
    expect(result.rows[0]?.password_length).toBeGreaterThanOrEqual(255);
  });

  it('unifica solicitudes de partido y jugador (0007)', async () => {
    const tables = await query<{
      requests: string | null;
      matchrequests: string | null;
    }>(`
      SELECT
        to_regclass('public.requests')::text AS requests,
        to_regclass('public.matchrequests')::text AS matchrequests
    `);

    expect(tables.rows[0]?.requests).toBe('requests');
    expect(tables.rows[0]?.matchrequests).toBeNull();

    const columns = await query<{ column_name: string; is_nullable: string }>(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'requests'
        AND column_name = ANY($1::text[])
      ORDER BY column_name
    `, [[
      'request_type',
      'sender_id',
      'receiver_id',
      'match_id',
      'target_user_id',
      'responded_at',
      'cancelled_at',
      'cancelled_by',
      'updated_at',
      'matchvacant_id',
    ]]);

    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'cancelled_at',
      'cancelled_by',
      'match_id',
      'matchvacant_id',
      'receiver_id',
      'request_type',
      'responded_at',
      'sender_id',
      'target_user_id',
      'updated_at',
    ]);

    const nullable = new Map(
      columns.rows.map((row) => [row.column_name, row.is_nullable]),
    );
    expect(nullable.get('request_type')).toBe('NO');
    expect(nullable.get('receiver_id')).toBe('NO');
    expect(nullable.get('matchvacant_id')).toBe('YES');
    expect(nullable.get('match_id')).toBe('YES');
    expect(nullable.get('target_user_id')).toBe('YES');

    const checks = await query<{ conname: string; def: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'requests'::regclass
        AND conname = ANY($1::text[])
    `, [[
      'requests_state_check',
      'requests_type_check',
      'requests_target_check',
      'requests_no_self_check',
    ]]);
    const checkByName = new Map(checks.rows.map((row) => [row.conname, row.def]));
    expect(checkByName.get('requests_state_check')).toContain('rejected');
    expect(checkByName.get('requests_state_check')).not.toContain('declined');
    expect(checkByName.get('requests_type_check')).toContain("'player'");
    expect(checkByName.get('requests_target_check')).toContain(
      "request_type = 'player'",
    );
    expect(checkByName.get('requests_no_self_check')).toContain('<>');

    const indexes = await query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
      ORDER BY indexname
    `, [[
      'requests_active_match_ux',
      'requests_active_player_ux',
      'requests_receiver_state_created_idx',
      'requests_type_state_created_idx',
      'requests_match_id_idx',
      'requests_target_user_id_idx',
      'requests_cancelled_by_idx',
    ]]);

    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'requests_active_match_ux',
      'requests_active_player_ux',
      'requests_cancelled_by_idx',
      'requests_match_id_idx',
      'requests_receiver_state_created_idx',
      'requests_target_user_id_idx',
      'requests_type_state_created_idx',
    ]);

    const matchUnique = indexes.rows.find(
      (row) => row.indexname === 'requests_active_match_ux',
    );
    expect(matchUnique?.indexdef).toContain('UNIQUE');
    expect(matchUnique?.indexdef).toContain('(sender_id, match_id)');
    expect(matchUnique?.indexdef).toContain("request_type = 'match'");
    expect(matchUnique?.indexdef).toContain("'pending'");
    expect(matchUnique?.indexdef).toContain("'accepted'");

    const playerUnique = indexes.rows.find(
      (row) => row.indexname === 'requests_active_player_ux',
    );
    expect(playerUnique?.indexdef).toContain('UNIQUE');
    expect(playerUnique?.indexdef).toContain('(sender_id, target_user_id)');
    expect(playerUnique?.indexdef).toContain("request_type = 'player'");

    const fks = await query<{ conname: string; def: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'requests'::regclass
        AND conname = ANY($1::text[])
    `, [[
      'requests_sender_id_fkey',
      'requests_receiver_id_fkey',
      'requests_target_user_id_fkey',
      'requests_vacancy_match_fkey',
      'requests_match_receiver_fkey',
    ]]);
    const fkByName = new Map(fks.rows.map((row) => [row.conname, row.def]));
    expect(fkByName.get('requests_sender_id_fkey')).toContain('ON DELETE CASCADE');
    expect(fkByName.get('requests_vacancy_match_fkey')).toContain(
      '(matchvacant_id, match_id)',
    );
    expect(fkByName.get('requests_match_receiver_fkey')).toContain(
      '(match_id, receiver_id)',
    );
    expect(fkByName.get('requests_match_receiver_fkey')).toContain(
      'matchs(id, creator_id)',
    );
  });

  it('crea la tabla de notificaciones (0008)', async () => {
    const columns = await query<{
      column_name: string;
      is_nullable: string;
    }>(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notifications'
      ORDER BY column_name
    `);

    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'actor_id',
      'created_at',
      'id',
      'match_id',
      'rating_id',
      'read_at',
      'request_id',
      'type',
      'user_id',
    ]);

    const nullable = new Map(
      columns.rows.map((row) => [row.column_name, row.is_nullable]),
    );
    expect(nullable.get('user_id')).toBe('NO');
    expect(nullable.get('type')).toBe('NO');
    expect(nullable.get('request_id')).toBe('YES');
    expect(nullable.get('match_id')).toBe('YES');
    expect(nullable.get('rating_id')).toBe('YES');
    expect(nullable.get('actor_id')).toBe('YES');
    expect(nullable.get('read_at')).toBe('YES');
    expect(nullable.get('created_at')).toBe('NO');

    const checks = await query<{ conname: string; def: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'notifications'::regclass
        AND conname = ANY($1::text[])
    `, [[
      'notifications_type_check',
      'notifications_content_check',
      'notifications_no_self_check',
    ]]);
    const checkByName = new Map(
      checks.rows.map((row) => [row.conname, row.def]),
    );
    expect(checkByName.get('notifications_type_check')).toContain(
      'request_accepted',
    );
    expect(checkByName.get('notifications_type_check')).toContain(
      'request_cancelled',
    );
    expect(checkByName.get('notifications_type_check')).toContain(
      'match_cancelled',
    );
    expect(checkByName.get('notifications_type_check')).toContain(
      'content_hidden',
    );
    expect(checkByName.get('notifications_type_check')).toContain(
      'content_deleted',
    );
    expect(checkByName.get('notifications_content_check')).toContain(
      'match_cancelled',
    );
    expect(checkByName.get('notifications_content_check')).toContain(
      'content_deleted',
    );
    expect(checkByName.get('notifications_content_check')).toContain(
      'rating_id IS NOT NULL',
    );
    expect(checkByName.get('notifications_no_self_check')).toContain('<>');

    const indexes = await query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
      ORDER BY indexname
    `, [[
      'notifications_actor_id_idx',
      'notifications_match_id_idx',
      'notifications_rating_id_idx',
      'notifications_request_id_idx',
      'notifications_user_created_idx',
      'notifications_user_unread_created_idx',
    ]]);

    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'notifications_actor_id_idx',
      'notifications_match_id_idx',
      'notifications_rating_id_idx',
      'notifications_request_id_idx',
      'notifications_user_created_idx',
      'notifications_user_unread_created_idx',
    ]);

    const unreadIndex = indexes.rows.find(
      (row) => row.indexname === 'notifications_user_unread_created_idx',
    );
    expect(unreadIndex?.indexdef).toContain('(user_id, created_at DESC, id DESC)');
    expect(unreadIndex?.indexdef).toContain('read_at IS NULL');

    const fks = await query<{ conname: string; def: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'notifications'::regclass
        AND conname = ANY($1::text[])
    `, [[
      'notifications_user_id_fkey',
      'notifications_request_id_fkey',
      'notifications_match_id_fkey',
      'notifications_actor_id_fkey',
      'notifications_rating_id_fkey',
    ]]);
    const fkByName = new Map(fks.rows.map((row) => [row.conname, row.def]));
    expect(fkByName.get('notifications_user_id_fkey')).toContain(
      'ON DELETE CASCADE',
    );
    expect(fkByName.get('notifications_request_id_fkey')).toContain(
      'ON DELETE CASCADE',
    );
    expect(fkByName.get('notifications_match_id_fkey')).toContain(
      'ON DELETE CASCADE',
    );
    expect(fkByName.get('notifications_actor_id_fkey')).toContain(
      'ON DELETE SET NULL',
    );
    expect(fkByName.get('notifications_rating_id_fkey')).toContain(
      'ON DELETE SET NULL',
    );
  });

  it('añade autor, rango y configuración a las calificaciones (0009)', async () => {
    const columns = await query<{
      column_name: string;
      is_nullable: string;
    }>(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usersratings'
      ORDER BY column_name
    `);

    const nullable = new Map(
      columns.rows.map((row) => [row.column_name, row.is_nullable]),
    );
    expect(nullable.get('author_id')).toBe('YES');
    expect(nullable.get('updated_at')).toBe('NO');
    expect(nullable.get('created_at')).toBe('NO');
    expect(nullable.get('score')).toBe('NO');
    expect(nullable.get('comment')).toBe('YES');

    const checks = await query<{ conname: string; def: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'usersratings'::regclass
        AND conname = ANY($1::text[])
    `, [[
      'usersratings_score_check',
      'usersratings_comment_check',
      'usersratings_no_self_check',
    ]]);
    const checkByName = new Map(
      checks.rows.map((row) => [row.conname, row.def]),
    );
    expect(checkByName.get('usersratings_score_check')).toContain('>= 1');
    expect(checkByName.get('usersratings_score_check')).toContain('<= 10');
    expect(checkByName.get('usersratings_comment_check')).toContain('240');
    expect(checkByName.get('usersratings_no_self_check')).toContain('<>');

    const fk = await query<{ def: string }>(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'usersratings'::regclass
        AND conname = 'usersratings_author_id_fkey'
    `);
    expect(fk.rows[0]?.def).toContain('REFERENCES users(id)');
    expect(fk.rows[0]?.def).toContain('ON DELETE CASCADE');

    const index = await query<{ indexdef: string }>(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'usersratings_author_player_ux'
    `);
    expect(index.rows[0]?.indexdef).toContain('(author_id, player_id)');
    expect(index.rows[0]?.indexdef).toContain('author_id IS NOT NULL');

    const setting = await query<{ value: boolean; description: string | null }>(`
      SELECT value, description
      FROM systemsettings
      WHERE key = 'ratings.require_accepted_request'
    `);
    expect(setting.rows[0]?.value).toBe(false);
    expect(setting.rows[0]?.description).toContain('solicitud aceptada');
  });

  it('agrega moderación, reportes y configuración (0010)', async () => {
    const moderation = await query<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT table_name, column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('matchs', 'usersratings')
        AND column_name IN ('moderation_state', 'moderated_at', 'moderated_by')
      ORDER BY table_name, column_name
    `);

    expect(moderation.rows).toHaveLength(6);
    for (const row of moderation.rows) {
      if (row.column_name === 'moderation_state') {
        expect(row.is_nullable).toBe('NO');
        expect(row.column_default).toContain('visible');
      } else {
        expect(row.is_nullable).toBe('YES');
      }
    }

    const checks = await query<{ conname: string; def: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid IN ('matchs'::regclass, 'usersratings'::regclass)
        AND conname IN (
          'matchs_moderation_state_check',
          'usersratings_moderation_state_check'
        )
    `);
    const checkByName = new Map(checks.rows.map((row) => [row.conname, row.def]));
    expect(checkByName.get('matchs_moderation_state_check')).toContain("'hidden'");
    expect(checkByName.get('matchs_moderation_state_check')).toContain("'deleted'");
    expect(checkByName.get('usersratings_moderation_state_check')).toContain(
      "'visible'",
    );

    const indexes = await query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
      ORDER BY indexname
    `, [[
      'matchs_moderation_created_idx',
      'matchs_moderated_by_idx',
      'usersratings_moderation_created_idx',
      'usersratings_moderated_by_idx',
      'generatedreports_created_idx',
      'generatedreports_generated_by_idx',
      'positions_title_lower_ux',
      'localities_name_lower_ux',
    ]]);

    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'generatedreports_created_idx',
      'generatedreports_generated_by_idx',
      'localities_name_lower_ux',
      'matchs_moderated_by_idx',
      'matchs_moderation_created_idx',
      'positions_title_lower_ux',
      'usersratings_moderated_by_idx',
      'usersratings_moderation_created_idx',
    ]);

    const uniqueCatalog = await query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('positions_title_lower_ux', 'localities_name_lower_ux')
    `);
    for (const row of uniqueCatalog.rows) {
      expect(row.indexdef).toContain('UNIQUE');
    }

    const reportColumns = await query<{ column_name: string; is_nullable: string }>(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'generatedreports'
      ORDER BY column_name
    `);

    expect(reportColumns.rows.map((row) => row.column_name)).toEqual([
      'created_at',
      'csv_data',
      'generated_by',
      'id',
      'period_end',
      'period_start',
      'report_type',
      'row_count',
    ]);

    const settings = await query<{ key: string; value: string }>(`
      SELECT key, value::text AS value
      FROM systemsettings
      WHERE key = ANY($1::text[])
      ORDER BY key
    `, [['notifications.enabled', 'ratings.max_score', 'ratings.min_score']]);

    expect(settings.rows).toEqual([
      { key: 'notifications.enabled', value: 'true' },
      { key: 'ratings.max_score', value: '5' },
      { key: 'ratings.min_score', value: '1' },
    ]);
  });
});
