create or replace function private.recompute_connection() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lo_answered_at is not null and new.hi_answered_at is not null and new.status = 'pending' then
    new.status := 'confirmed';
    new.confirmed_at := now();
  end if;
  if new.status = 'confirmed' then
    new.eff_type := case when new.lo_type = new.hi_type then new.lo_type else null end;
    new.eff_years := least(new.lo_years, new.hi_years);
    new.eff_strength := least(new.lo_strength, new.hi_strength);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger connections_recompute before insert or update on public.connections
  for each row execute function private.recompute_connection();

create or replace function private.sync_edges() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.connection_edges where connection_id = new.id;
  if new.status = 'confirmed' then
    insert into public.connection_edges(src,dst,connection_id,eff_type,eff_years,eff_strength) values
      (new.user_lo,new.user_hi,new.id,new.eff_type,new.eff_years,new.eff_strength),
      (new.user_hi,new.user_lo,new.id,new.eff_type,new.eff_years,new.eff_strength);
  end if;
  return new;
end $$;
create trigger connections_sync_edges after insert or update on public.connections
  for each row execute function private.sync_edges();
