-- New enum value only. PostgreSQL cannot use a value added in the same transaction.

alter type public.feed_kind add value if not exists 'breast';
