-- Where clients pay: a UPI ID for rupee invoices and a WhatsApp number for every other currency.
alter table public.company_settings add column if not exists upi_id text;
alter table public.company_settings add column if not exists upi_name text;
alter table public.company_settings add column if not exists whatsapp_number text;
