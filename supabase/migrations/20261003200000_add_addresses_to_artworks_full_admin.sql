-- Ajoute l'adresse choisie aux objets location et destination de la vue (fiche / impression)
CREATE OR REPLACE VIEW public.artworks_full_admin WITH (security_invoker = true) AS
 SELECT a.id,
    a.date_proposition,
    a.artist_id,
    a.proposed_by_id,
    a.title,
    a.medium,
    a.year_execution,
    a.height_cm,
    a.width_cm,
    a.depth_cm,
    a.condition,
    a.provenance,
    a.exhibition_literature,
    a.certificate,
    a.certificate_location,
    a.asking_price,
    a.currency,
    a.location_of_work,
    a.check_seller,
    a.priority,
    a.status,
    a.view_date,
    a.notes,
    a.created_at,
    a.updated_at,
    a.auctions,
    a.sale_date,
    a.sale_time,
    a.auction_link,
    a.estimate_low,
    a.estimate_high,
    a.guarantee,
    a.auction_contact_id,
    a.auction_currency,
    a.buyer_contact_id,
    a.cost_amount,
    a.cost_currency,
    a.insurance_value,
    a.insurance_currency,
    a.destination_contact_id,
    a.created_by,
    a.location_contact_id,
    a.certificate_location_contact_id,
    a.sold_hammer,
    a.sold_premium,
    a.underbidder,
    a.signature,
    a.lot,
    a.date_acquisition,
    a.commission_blondeau,
    a.auction_max_hammer,
    a.auction_max_premium,
    a.rapport_heritier,
    a.rapport_heritier_document_id,
        CASE
            WHEN (ar.id IS NOT NULL) THEN jsonb_build_object('id', ar.id, 'first_name', ar.first_name, 'last_name', ar.last_name, 'name', concat_ws(' '::text, ar.first_name, ar.last_name), 'place_of_birth', ar.place_of_birth, 'year_of_birth', ar.year_of_birth, 'place_of_death', ar.place_of_death, 'year_of_death', ar.year_of_death)
            ELSE NULL::jsonb
        END AS artist,
        CASE
            WHEN (proposed.id IS NOT NULL) THEN jsonb_build_object('id', proposed.id, 'company_name', proposed.company_name, 'first_name', proposed.first_name, 'last_name', proposed.last_name)
            ELSE NULL::jsonb
        END AS "proposedBy",
        CASE
            WHEN (buyer.id IS NOT NULL) THEN jsonb_build_object('id', buyer.id, 'company_name', buyer.company_name, 'first_name', buyer.first_name, 'last_name', buyer.last_name)
            ELSE NULL::jsonb
        END AS buyer,
    COALESCE(prop.proposals, '[]'::jsonb) AS proposals,
    COALESCE(doc.documents, '[]'::jsonb) AS documents,
    COALESCE(img.images, '[]'::jsonb) AS images,
    COALESCE(NULLIF(TRIM(BOTH FROM proposed.company_name), ''::text), NULLIF(TRIM(BOTH FROM concat_ws(' '::text, proposed.first_name, proposed.last_name)), ''::text), '—'::text) AS proposed_by_name,
    a.buyer_contact_id AS buyer_id,
    a.acquired,
    alc.last_changed_at,
    alc.changed_fields,
    alc.diff AS changed_diff,
        CASE
            WHEN (location_c.id IS NOT NULL) THEN jsonb_build_object('id', location_c.id, 'company_name', location_c.company_name, 'first_name', location_c.first_name, 'last_name', location_c.last_name, 'address', NULLIF(concat_ws(', ', NULLIF(btrim(loc_addr.label), ''), NULLIF(btrim(loc_addr.address), ''), NULLIF(btrim(concat_ws(' ', loc_addr.postal_code, loc_addr.city)), ''), NULLIF(btrim(loc_addr.country), '')), ''))
            ELSE NULL::jsonb
        END AS location,
        CASE
            WHEN (cert_loc.id IS NOT NULL) THEN jsonb_build_object('id', cert_loc.id, 'company_name', cert_loc.company_name, 'first_name', cert_loc.first_name, 'last_name', cert_loc.last_name)
            ELSE NULL::jsonb
        END AS "certificateLocation",
        CASE
            WHEN (destination_c.id IS NOT NULL) THEN jsonb_build_object('id', destination_c.id, 'company_name', destination_c.company_name, 'first_name', destination_c.first_name, 'last_name', destination_c.last_name, 'address', NULLIF(concat_ws(', ', NULLIF(btrim(dest_addr.label), ''), NULLIF(btrim(dest_addr.address), ''), NULLIF(btrim(concat_ws(' ', dest_addr.postal_code, dest_addr.city)), ''), NULLIF(btrim(dest_addr.country), '')), ''))
            ELSE NULL::jsonb
        END AS destination,
        CASE
            WHEN (auction_c.id IS NOT NULL) THEN jsonb_build_object('id', auction_c.id, 'company_name', auction_c.company_name, 'first_name', auction_c.first_name, 'last_name', auction_c.last_name)
            ELSE NULL::jsonb
        END AS "auctionContact",
        CASE
            WHEN (doc_rh.id IS NOT NULL) THEN jsonb_build_object('id', doc_rh.id, 'artwork_id', doc_rh.artwork_id, 'document_type', doc_rh.document_type, 'label', doc_rh.label, 'url', doc_rh.url, 'position', doc_rh."position", 'created_at', doc_rh.created_at)
            ELSE NULL::jsonb
        END AS rapport_heritier_document
   FROM ((((((((((((((artworks a
     LEFT JOIN artworks_last_change alc ON ((alc.artwork_id = a.id)))
     LEFT JOIN artists ar ON ((ar.id = a.artist_id)))
     LEFT JOIN contacts proposed ON ((proposed.id = a.proposed_by_id)))
     LEFT JOIN contacts buyer ON ((buyer.id = a.buyer_contact_id)))
     LEFT JOIN contacts location_c ON ((location_c.id = a.location_contact_id)))
     LEFT JOIN contacts cert_loc ON ((cert_loc.id = a.certificate_location_contact_id)))
     LEFT JOIN contacts destination_c ON ((destination_c.id = a.destination_contact_id)))
     LEFT JOIN contacts auction_c ON ((auction_c.id = a.auction_contact_id)))
     LEFT JOIN contact_addresses loc_addr ON ((loc_addr.id = a.location_address_id)))
     LEFT JOIN contact_addresses dest_addr ON ((dest_addr.id = a.destination_address_id)))
     LEFT JOIN documents doc_rh ON ((doc_rh.id = a.rapport_heritier_document_id)))
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('id', ap.id, 'contact_id', ap.contact_id, 'proposed_at', ap.proposed_at, 'contact_label', COALESCE(NULLIF(TRIM(BOTH FROM c.company_name), ''::text), NULLIF(TRIM(BOTH FROM concat_ws(' '::text, c.first_name, c.last_name)), ''::text), '—'::text))) AS proposals
           FROM (artwork_proposals ap
             LEFT JOIN contacts c ON ((c.id = ap.contact_id)))
          WHERE (ap.artwork_id = a.id)) prop ON (true))
     LEFT JOIN LATERAL ( SELECT jsonb_agg(to_jsonb(d.*)) AS documents
           FROM documents d
          WHERE (d.artwork_id = a.id)) doc ON (true))
     LEFT JOIN LATERAL ( SELECT jsonb_agg(to_jsonb(d.*)) AS images
           FROM documents d
          WHERE ((d.artwork_id = a.id) AND (d.document_type = 'image'::text))) img ON (true));
