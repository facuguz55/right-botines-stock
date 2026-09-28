-- Modelo puntual que pide el cliente ("los f50 negro blanco s/c"), además del
-- talle y el tipo (038). Se guarda tal como lo nombró el cliente, filtrado a
-- palabras que existen en el catálogo — ver extraerModeloBuscado en
-- src/lib/crmBusqueda.ts.
alter table wsp_conversaciones add column if not exists busqueda_modelo text;
alter table wsp_ia_sugerencias add column if not exists modelo_buscado text;
