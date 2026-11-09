
'use client';

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { LinkedText } from '@/components/ui/LinkedText';
import { supabase } from '@/lib/supabaseBrowser';

type ProfileRole = 'Administrator' | 'Editor' | 'Viewer' | null;

type MarketCategory = 'Foire' | 'Ventes aux enchères' | 'Autre';

type MarketItemType = 'web_link' | 'document';
type CatalogueStatus = 'Yes' | 'No' | 'Received' | 'Printed';
type PaddlePlacesStatus = 'No' | 'Yes 1' | 'Yes 2';
type ItemSortMode = 'label_asc' | 'created_desc' | 'auction_datetime_asc';
type MarketViewMode = 'sections' | 'calendar';


type MarketSection = {
  id: string;
  title: string;
  category: MarketCategory;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type MarketSectionItemView = {
  id: string;
  section_id: string;
  item_type: MarketItemType;
  label: string;
  web_url: string | null;
  added_at: string;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  auction_house: string | null;
  auction_datetime: string | null;
  catalogue_status: CatalogueStatus | null;
  paddle_places: PaddlePlacesStatus | null;
  document_id: string | null;
  document_url: string | null;
  document_type: string | null;
};

type SectionWithItems = MarketSection & {
  items: MarketSectionItemView[];
};

type EditState = {
  id: string;
  itemType: MarketItemType;
  label: string;
  url: string;
  addedAt: string;
  notes: string;
  documentType: string;
  auctionHouse: string;
  auctionDate: string;
  auctionTime: string;
  catalogueStatus: CatalogueStatus | '';
};

type SectionEditState = {
  id: string;
  title: string;
  category: MarketCategory;
  startDate: string;
  endDate: string;
  notes: string;
};

function formatDate(date?: string | null) {
  if (!date) return '—';
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('fr-CH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return 'Dates non précisées';
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return `Dès ${formatDate(start)}`;
  return `Jusqu’au ${formatDate(end)}`;
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isPastSection(section: MarketSection, today: string) {
  return Boolean(section.end_date && section.end_date < today);
}

function parseAuctionDateTimeRaw(dateTime?: string | null) {
  if (!dateTime) {
    return { auctionDate: '', auctionTime: '' };
  }

  const match = String(dateTime).match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (!match) {
    return { auctionDate: '', auctionTime: '' };
  }

  return {
    auctionDate: match[1],
    auctionTime: match[2],
  };
}

function formatAuctionDateTimeLocal(dateTime?: string | null) {
  const { auctionDate, auctionTime } = parseAuctionDateTimeRaw(dateTime);
  if (!auctionDate) return null;

  const [year, month, day] = auctionDate.split('-').map(Number);
  const monthNames = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  const dateLabel = `${day} ${monthNames[(month ?? 1) - 1]} ${year}`;
  if (!auctionTime) return `${dateLabel} (heure locale)`;

  return `${dateLabel}, ${auctionTime} (heure locale)`;
}

function buildAuctionDateTime(date?: string, time?: string) {
  if (!date) return null;
  if (!time) return `${date}T00:00:00`;
  return `${date}T${time}:00`;
}

function getItemHref(item: MarketSectionItemView) {
  return item.item_type === 'document' ? item.document_url ?? '#' : item.web_url ?? '#';
}

// SharePoint documents are served through an internal route and must keep that url.
function isSharePointDocument(item: MarketSectionItemView) {
  return item.item_type === 'document' && Boolean(item.document_url?.startsWith('/api/documents/'));
}

function getItemTypeLabel(item: MarketSectionItemView) {
  return item.item_type === 'document' ? 'PDF / OneDrive' : 'Lien web';
}

function getAuctionHouseColor(auctionHouse?: string | null) {
  const normalized = auctionHouse?.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized === 'christies' || normalized === 'cs') return '#b4232d';
  if (normalized === 'sothebys' || normalized === 'ss') return '#1d4ed8';
  if (normalized === 'phillips' || normalized === 'phs') return '#16803c';
  return '#334155';
}

function formatCalendarDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}


function sortSections(a: SectionWithItems, b: SectionWithItems) {
  const aDate = a.start_date ?? '0000-01-01';
  const bDate = b.start_date ?? '0000-01-01';

  if (aDate > bDate) return -1;
  if (aDate < bDate) return 1;

  if (a.position !== b.position) return a.position - b.position;

  return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
}




function sortItems(
  items: MarketSectionItemView[],
  mode: ItemSortMode,
  sectionCategory: MarketCategory
) {
  const copy = [...items];

  copy.sort((a, b) => {
    if (mode === 'label_asc') {
      return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });
    }

    if (mode === 'auction_datetime_asc' && sectionCategory === 'Ventes aux enchères') {
      const aValue = a.auction_datetime ?? '9999-12-31T23:59:59';
      const bValue = b.auction_datetime ?? '9999-12-31T23:59:59';

      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;

      // en cas d'égalité sur la date de vente, on met les plus récents d'abord
      if (a.created_at > b.created_at) return -1;
      if (a.created_at < b.created_at) return 1;

      return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });
    }

    // mode = created_desc => plus récent au plus ancien
    if (a.created_at > b.created_at) return -1;
    if (a.created_at < b.created_at) return 1;

    return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });
  });

  return copy;
}



function makeEditState(item: MarketSectionItemView): EditState {
  const { auctionDate, auctionTime } = parseAuctionDateTimeRaw(item.auction_datetime);

  return {
    id: item.id,
    itemType: item.item_type,
    label: item.label ?? '',
    url: item.item_type === 'document' ? item.document_url ?? '' : item.web_url ?? '',
    addedAt: item.added_at ?? '',
    notes: item.notes ?? '',
    documentType: item.document_type ?? 'market_pdf',
    auctionHouse: item.auction_house ?? '',
    auctionDate,
    auctionTime,
    catalogueStatus: item.catalogue_status ?? '',
  };
}

const styles: Record<string, CSSProperties> = {
  page: {
    width: 'min(1380px, 100%)',
    margin: '0 auto',
    padding: '0 20px 56px',
    fontFamily: 'inherit',
    color: '#17231e',
  },
  pageInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: '16px',
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    color: '#143b2d',
    fontSize: 'clamp(2rem, 4vw, 3.25rem)',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.035em',
  },

  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  alertSuccess: {
    border: '1px solid #a7f3d0',
    background: '#ecfdf5',
    color: '#047857',
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '14px',
  },
  alertError: {
    border: '1px solid #fecaca',
    background: '#fef2f2',
    color: '#b91c1c',
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '14px',
  },
  card: {
    border: '1px solid #d7dfda',
    borderRadius: '12px',
    background: '#ffffff',
    boxShadow: '0 10px 28px rgba(31,56,46,0.06)',
    overflow: 'hidden',
  },

  cardHeader: {
    borderBottom: '1px solid #e2e8f0',
    padding: '20px 22px 16px',
    background: '#fbfcfb',
  },
  cardTitle: {
    margin: 0,
    color: 'black',
    fontSize: '16px',
    fontWeight: 600,
  },
  cardSubtitle: {
    margin: '5px 0 0 0',
    fontSize: '14px',
    color: '#475569',
  },
  cardBody: {
    padding: '16px 20px',
  },

  formGridTwo: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  doubleColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#334155',
  },
  input: {
    width: '100%',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '14px',
    color: '#0f172a',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '14px',
    color: '#0f172a',
    boxSizing: 'border-box',
    minHeight: '110px',
    resize: 'vertical',
  },
  buttonPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 14px',
    background: '#006039',
    color: '#ffffff',
    border: '1px solid #006039',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
  buttonSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '4px 8px',
    background: '#ffffff',
    color: '#334155',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
  buttonDanger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '4px 8px',
    background: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  sectionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    color: 'black'
  },
  sectionHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  toggleButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    flex: '0 0 auto',
    width: '20px',
    minWidth: '20px',
    height: '20px',
    minHeight: '20px',
    padding: 0,
    borderRadius: '4px',
    border: '1px solid #94a3b8',
    background: '#f1f5f9',
    boxShadow: 'none',
    cursor: 'pointer',
    color: '#0f172a',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 700,
    lineHeight: 1,
  },
  sectionTitleText: {
    margin: 0,
    fontSize: '21px',
    fontWeight: 600,
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    color: '#334155',
    fontSize: '16px',
    fontWeight: 500,
  },
  noteText: {
    margin: 0,
    maxWidth: '850px',
    color: '#475569',
    fontSize: '14px',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  emptyBox: {
    border: '1px dashed #cbd5e1',
    borderRadius: '8px',
    padding: '16px',
    color: '#64748b',
    fontSize: '14px',
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  itemCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '4px',
    flexWrap: 'wrap',
  },
  itemContent: {
    flex: '1 1 600px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  itemHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  itemLinkActive: {
    color: '#0f172a',
    textDecoration: 'underline',
    textDecorationColor: '#cbd5e1',
    textUnderlineOffset: '4px',
    fontFamily: 'inherit',
    fontSize: '18px',
    fontWeight: 400,
    lineHeight: 1.6,
  },
  itemLinkInactive: {
    color: '#0f172a',
    fontFamily: 'inherit',
    fontSize: '18px',
    fontWeight: 400,
    lineHeight: 1.6,
  },
  itemMetaText: {
    color: '#000000',
    fontFamily: 'inherit',
    fontSize: '18px',
    fontWeight: 500,
    lineHeight: 1.6,
  },
  itemSecondaryText: {
    margin: 0,
    color: '#334155',
    fontFamily: 'inherit',
    fontSize: '16px',
    fontWeight: 400,
    lineHeight: 1.6,
  },
  rightActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  formStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formActionsRight: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    flexWrap: 'wrap',
  },
  helperText: {
    margin: 0,
    color: '#64748b',
    fontSize: '13px',
  },
sectionActions: {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '8px',
  flexWrap: 'wrap',
  marginLeft: 'auto',
},
sortButtonsContainer: {
  display: 'flex',
  gap: '6px',
},

sortButton: {
  padding: '4px 10px',
  fontSize: '12px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  background: '#f7f7f7',
  cursor: 'pointer',
},

sortButtonActive: {
  background: '#0b66c3',
  color: '#fff',
  border: '1px solid #0b66c3',
},


};

function getButtonStyle(kind: 'primary' | 'secondary' | 'danger', disabled = false): CSSProperties {
  const base = kind === 'primary'
    ? styles.buttonPrimary
    : kind === 'danger'
      ? styles.buttonDanger
      : styles.buttonSecondary;

  return disabled ? { ...base, ...styles.disabledButton } : base;
}

export default function MarketPage() {
    console.log('✅ MarketPage rendered');
  const [role, setRole] = useState<ProfileRole>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<MarketViewMode>('calendar');


const [sections, setSections] = useState<SectionWithItems[]>([]);
const [sectionSortModes, setSectionSortModes] = useState<Record<string, ItemSortMode>>({});

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [sectionEditState, setSectionEditState] = useState<SectionEditState | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sectionForm, setSectionForm] = useState({
    title: '',
    category: 'Foire' as MarketCategory,
    startDate: '',
    endDate: '',
    notes: '',
  });

  const [itemForm, setItemForm] = useState({
    sectionId: '',
    itemType: 'web_link' as MarketItemType,
    label: '',
    url: '',
    addedAt: new Date().toISOString().slice(0, 10),
    notes: '',
    documentType: 'market_pdf',
    auctionHouse: '',
    auctionDate: '',
    auctionTime: '',
    catalogueStatus: '',
  });
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const canEdit = role === 'Administrator' || role === 'Editor';

  


function getDefaultSortMode(section: MarketSection): ItemSortMode {
  return section.category === 'Ventes aux enchères'
    ? 'auction_datetime_asc'
    : 'created_desc';
}



function getSectionSortMode(section: MarketSection): ItemSortMode {
  return sectionSortModes[section.id] ?? getDefaultSortMode(section);
}


  async function loadRole() {
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('LOAD AUTH USER ERROR', authError);
      return null;
    }

    const userId = authData.user?.id;
    if (!userId) return null;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('LOAD PROFILE ROLE ERROR', profileError);
      return null;
    }

    return (profile?.role as ProfileRole) ?? null;
  }

  async function loadData() {
    setLoading(true);
    setErrorMessage(null);

    

    const currentRole = await loadRole();
    setRole(currentRole);

    const [{ data: sectionsData, error: sectionsError }, { data: itemsData, error: itemsError }] =
      await Promise.all([
        supabase
          .from('market_sections')
          .select('*')
          .order('start_date', { ascending: false, nullsFirst: false })
          .order('position', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase.from('v_market_section_items').select('*'),
      ]);

    if (sectionsError) {
      console.error('LOAD MARKET SECTIONS ERROR', sectionsError);
      setErrorMessage(`Erreur de chargement des sections : ${sectionsError.message}`);
      setLoading(false);
      return;
    }

    if (itemsError) {
      console.error('LOAD MARKET ITEMS ERROR', itemsError);
      setErrorMessage(`Erreur de chargement des ressources : ${itemsError.message}`);
      setLoading(false);
      return;
    }
    
console.log('sectionsData', sectionsData);
console.log('sectionsError', sectionsError);
console.log('itemsData', itemsData);
console.log('itemsError', itemsError);


    const sectionMap = new Map<string, SectionWithItems>();

    (sectionsData ?? []).forEach((section) => {
      sectionMap.set(section.id, {
        ...(section as MarketSection),
        items: [],
      });
    });

    (itemsData ?? []).forEach((item) => {
      const section = sectionMap.get(item.section_id);
      if (section) {
        section.items.push(item as MarketSectionItemView);
      }
    });

    const merged = Array.from(sectionMap.values()).sort(sortSections);
    setSections(merged);

    
setSectionSortModes((prev) => {
  const next = { ...prev };

  merged.forEach((section) => {
    if (!next[section.id]) {
      next[section.id] = getDefaultSortMode(section);
    }
  });

  return next;
});


    setExpandedSections((prev) => {
      const next: Record<string, boolean> = { ...prev };

      merged.forEach((section) => {
        if (typeof next[section.id] === 'undefined') {
          next[section.id] = false;
        }
      });

      return next;
    });

    if (!itemForm.sectionId && merged.length > 0) {
      setItemForm((prev) => ({
        ...prev,
        sectionId: merged[0].id,
      }));
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);


const todayDate = getLocalDateKey(new Date());
const displaySections = useMemo(() => {
  const sortedSections = sections.map((section) => ({
    ...section,
    items: sortItems(section.items, getSectionSortMode(section), section.category),
  }));

  const compareByStartDate = (a: SectionWithItems, b: SectionWithItems, descending: boolean) => {
    if (a.start_date !== b.start_date) {
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return descending
        ? b.start_date.localeCompare(a.start_date)
        : a.start_date.localeCompare(b.start_date);
    }

    if (a.position !== b.position) return a.position - b.position;
    return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
  };

  const futureSections = sortedSections
    .filter((section) => !isPastSection(section, todayDate))
    .sort((a, b) => compareByStartDate(a, b, false));
  const pastSections = sortedSections
    .filter((section) => isPastSection(section, todayDate))
    .sort((a, b) => compareByStartDate(a, b, true));

  return [...futureSections, ...pastSections];
}, [sections, sectionSortModes, todayDate]);

const calendarSections = useMemo(() => displaySections
  .map((section) => ({
    ...section,
    items: section.items
      .filter((item) => {
        const { auctionDate } = parseAuctionDateTimeRaw(item.auction_datetime);
        return Boolean(auctionDate) && auctionDate > todayDate;
      })
      .sort((a, b) =>
        (a.auction_datetime ?? '').localeCompare(b.auction_datetime ?? '') ||
        a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })
      ),
  }))
  .filter((section) => section.items.length > 0), [displaySections, todayDate]);

const calendarEntryCount = calendarSections.reduce(
  (count, section) => count + section.items.length,
  0
);


  function toggleSection(sectionId: string) {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }


  function startInlineEdit(item: MarketSectionItemView) {
    setEditingItemId(item.id);
    setEditState(makeEditState(item));
    setMessage(null);
    setErrorMessage(null);
  }

  function cancelInlineEdit() {
    setEditingItemId(null);
    setEditState(null);
  }

  async function handleSaveInlineEdit(item: MarketSectionItemView) {
    if (!canEdit || !editState || editingItemId !== item.id) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    const label = editState.label.trim();
    const url = editState.url.trim();

    if (!label) {
      setErrorMessage('Le label est obligatoire.');
      setSaving(false);
      return;
    }

    if (!url && !isSharePointDocument(item)) {
      setErrorMessage('Le lien est obligatoire.');
      setSaving(false);
      return;
    }

    const auctionHouse = editState.auctionHouse.trim() || null;
    const auctionDateTime = buildAuctionDateTime(editState.auctionDate, editState.auctionTime);
    const notes = editState.notes.trim() || null;
    const addedAt = editState.addedAt || item.added_at;

    const { error: itemUpdateError } = await supabase
      .from('market_section_items')
      .update({
        label,
        added_at: addedAt,
        notes,
        auction_house: auctionHouse,
        auction_datetime: auctionDateTime,
        catalogue_status: editState.catalogueStatus || null,
        ...(item.item_type === 'web_link' ? { url } : {}),
      })
      .eq('id', item.id);

    if (itemUpdateError) {
      console.error('UPDATE MARKET ITEM ERROR', itemUpdateError);
      setErrorMessage(`Impossible d’enregistrer la ressource : ${itemUpdateError.message}`);
      setSaving(false);
      return;
    }

    if (item.item_type === 'document' && item.document_id) {
      const { error: documentUpdateError } = await supabase
        .from('documents')
        .update({
          ...(isSharePointDocument(item) ? {} : { url }),
          document_type: editState.documentType || item.document_type || 'market_pdf',
        })
        .eq('id', item.document_id);

      if (documentUpdateError) {
        console.error('UPDATE MARKET DOCUMENT ERROR', documentUpdateError);
        setErrorMessage(`Impossible de mettre à jour le document : ${documentUpdateError.message}`);
        setSaving(false);
        return;
      }
    }

    setMessage('Ressource mise à jour.');
    setSaving(false);
    setEditingItemId(null);
    setEditState(null);
    await loadData();
  }

  async function handleCatalogueStatusChange(itemId: string, value: string) {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    const { error } = await supabase
      .from('market_section_items')
      .update({ catalogue_status: value || null })
      .eq('id', itemId);

    if (error) {
      console.error('UPDATE MARKET CATALOGUE STATUS ERROR', error);
      setErrorMessage(`Unable to update catalogue status: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage('Catalogue status updated.');
    setSaving(false);
    await loadData();
  }

  async function handlePaddlePlacesChange(itemId: string, value: string) {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    const { error } = await supabase
      .from('market_section_items')
      .update({ paddle_places: value || null })
      .eq('id', itemId);

    if (error) {
      console.error('UPDATE MARKET PADDLE/PLACES ERROR', error);
      setErrorMessage(`Unable to update Paddle/Places: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage('Paddle/Places updated.');
    setSaving(false);
    await loadData();
  }

  async function handleCreateSection(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    const title = sectionForm.title.trim();

    if (!title) {
      setErrorMessage('Le titre de la section est obligatoire.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('market_sections').insert({
      title,
      category: sectionForm.category,
      start_date: sectionForm.startDate || null,
      end_date: sectionForm.endDate || null,
      notes: sectionForm.notes.trim() || null,
      position: sections.length,
    });

    if (error) {
      console.error('CREATE MARKET SECTION ERROR', error);
      setErrorMessage(`Impossible de créer la section : ${error.message}`);
      setSaving(false);
      return;
    }

    setSectionForm({
      title: '',
      category: 'Foire',
      startDate: '',
      endDate: '',
      notes: '',
    });

    setMessage('Section créée.');
    setSaving(false);
    await loadData();
  }

  function startSectionEdit(section: MarketSection) {
    setSectionEditState({
      id: section.id,
      title: section.title,
      category: section.category,
      startDate: section.start_date ?? '',
      endDate: section.end_date ?? '',
      notes: section.notes ?? '',
    });
    setEditingItemId(null);
    setEditState(null);
    setMessage(null);
    setErrorMessage(null);
  }

  function cancelSectionEdit() {
    setSectionEditState(null);
  }

  async function handleSaveSectionEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit || !sectionEditState) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    const title = sectionEditState.title.trim();
    if (!title) {
      setErrorMessage('Section title is required.');
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('market_sections')
      .update({
        title,
        category: sectionEditState.category,
        start_date: sectionEditState.startDate || null,
        end_date: sectionEditState.endDate || null,
        notes: sectionEditState.notes.trim() || null,
      })
      .eq('id', sectionEditState.id);

    if (error) {
      console.error('UPDATE MARKET SECTION ERROR', error);
      setErrorMessage(`Unable to update section: ${error.message}`);
      setSaving(false);
      return;
    }

    setSectionEditState(null);
    setMessage('Section updated.');
    setSaving(false);
    await loadData();
  }

    async function handleCreateItem(e: React.FormEvent<HTMLFormElement>) {

    e.preventDefault();
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    const label = itemForm.label.trim();
    const sectionId = itemForm.sectionId;
    const notes = itemForm.notes.trim() || null;
    const addedAt = itemForm.addedAt || new Date().toISOString().slice(0, 10);
    const auctionHouse = itemForm.auctionHouse.trim() || null;
    const auctionDateTime = buildAuctionDateTime(itemForm.auctionDate, itemForm.auctionTime);

    if (!sectionId) {
      setErrorMessage('Veuillez sélectionner une section.');
      setSaving(false);
      return;
    }

    if (!label) {
      setErrorMessage('Le label est obligatoire.');
      setSaving(false);
      return;
    }

    if (itemForm.itemType === 'web_link') {
      const url = itemForm.url.trim();

      if (!url) {
        setErrorMessage('L’URL est obligatoire pour un lien web.');
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('market_section_items').insert({
        section_id: sectionId,
        item_type: 'web_link',
        label,
        url,
        added_at: addedAt,
        notes,
        position: 0,
        auction_house: auctionHouse,
        auction_datetime: auctionDateTime,
        catalogue_status: itemForm.catalogueStatus || null,
      });

      if (error) {
        console.error('CREATE MARKET WEB LINK ERROR', error);
        setErrorMessage(`Impossible d’ajouter le lien : ${error.message}`);
        setSaving(false);
        return;
      }

      setItemForm((prev) => ({
        ...prev,
        label: '',
        url: '',
        notes: '',
        addedAt: new Date().toISOString().slice(0, 10),
        documentType: 'market_pdf',
        auctionHouse: '',
        auctionDate: '',
        auctionTime: '',
        catalogueStatus: '',
      }));

      setMessage('Lien ajouté.');
      setSaving(false);
      await loadData();
      return;
    }

    const documentUrl = itemForm.url.trim();

    if (!documentUrl && !itemFile) {
      setErrorMessage('Choisissez un fichier ou saisissez une URL pour un document.');
      setSaving(false);
      return;
    }

    const { data: itemData, error: itemError } = await supabase
      .from('market_section_items')
      .insert({
        section_id: sectionId,
        item_type: 'document',
        label,
        added_at: addedAt,
        notes,
        position: 0,
        auction_house: auctionHouse,
        auction_datetime: auctionDateTime,
        catalogue_status: itemForm.catalogueStatus || null,
      })
      .select('id')
      .single();

    if (itemError || !itemData?.id) {
      console.error('CREATE MARKET DOCUMENT ITEM ERROR', itemError);
      setErrorMessage(
        `Impossible de créer la ressource document : ${itemError?.message ?? 'Erreur inconnue'}`
      );
      setSaving(false);
      return;
    }

    if (itemFile) {
      const body = new FormData();
      body.append('file', itemFile);
      body.append('document_type', itemForm.documentType || 'market_pdf');

      const uploadRes = await fetch(`/api/market/items/${itemData.id}/sharepoint-document`, {
        method: 'POST',
        credentials: 'include',
        body,
      });

      if (!uploadRes.ok) {
        const uploadError = await uploadRes.json().catch(() => null);
        await supabase.from('market_section_items').delete().eq('id', itemData.id);
        setErrorMessage(`Impossible d’uploader le fichier : ${uploadError?.error ?? 'erreur inconnue'}`);
        setSaving(false);
        return;
      }
    } else {
      const { error: documentError } = await supabase.from('documents').insert({
        url: documentUrl,
        document_type: itemForm.documentType || 'market_pdf',
        market_section_item_id: itemData.id,
        position: 0,
        artwork_id: null,
      });

      if (documentError) {
        console.error('CREATE MARKET DOCUMENT ERROR raw:', documentError);

        await supabase.from('market_section_items').delete().eq('id', itemData.id);

        setErrorMessage(
          `Impossible d’ajouter le document : ${
            documentError?.message ||
            documentError?.details ||
            documentError?.hint ||
            'erreur inconnue'
          }`
        );
        setSaving(false);
        return;
      }
    }

    setItemFile(null);
    setItemForm((prev) => ({
      ...prev,
      label: '',
      url: '',
      notes: '',
      addedAt: new Date().toISOString().slice(0, 10),
      documentType: 'market_pdf',
      auctionHouse: '',
      auctionDate: '',
      auctionTime: '',
      catalogueStatus: '',
    }));

    setMessage('Document ajouté.');
    setSaving(false);
    await loadData();
  }

  async function removeSharePointFiles(items: MarketSectionItemView[]) {
    for (const item of items) {
      if (!item.document_id || !isSharePointDocument(item)) continue;
      const res = await fetch(`/api/documents/${item.document_id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) return false;
    }
    return true;
  }

  async function handleDeleteItem(itemId: string) {
    if (!canEdit) return;

    const ok = window.confirm('Supprimer cette ressource ?');
    if (!ok) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    const target = sections.flatMap((s) => s.items).filter((i) => i.id === itemId);
    if (!(await removeSharePointFiles(target))) {
      setErrorMessage('Impossible de supprimer le fichier SharePoint.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('market_section_items').delete().eq('id', itemId);

    if (error) {
      console.error('DELETE MARKET ITEM ERROR', error);
      setErrorMessage(`Impossible de supprimer la ressource : ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage('Ressource supprimée.');
    setSaving(false);
    await loadData();
  }

  async function handleDeleteSection(sectionId: string) {
    if (!canEdit) return;

    const ok = window.confirm(
      'Supprimer cette section ? Les ressources et documents liés seront également supprimés.'
    );
    if (!ok) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    const sectionItems = sections.find((s) => s.id === sectionId)?.items ?? [];
    if (!(await removeSharePointFiles(sectionItems))) {
      setErrorMessage('Impossible de supprimer les fichiers SharePoint.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('market_sections').delete().eq('id', sectionId);

    if (error) {
      console.error('DELETE MARKET SECTION ERROR', error);
      setErrorMessage(`Impossible de supprimer la section : ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage('Section supprimée.');
    setSaving(false);
    await loadData();
  }

  const twoColumnsResponsiveStyle: CSSProperties = {
    ...styles.doubleColumn,
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
  };


  return (
        <main
      style={{
        paddingTop: 96,
        paddingLeft: 10,
        paddingRight: 10,
        paddingBottom: 56,
        minHeight: "100vh",
        background: "#f3f5f1",
      }}
    >
    <div style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.topBar}>
          <div>
            <div className="market-page-eyebrow">Research & opportunities</div>
            <h1 style={styles.title}>Art Market</h1>
            <p className="market-page-subtitle">Previews, fairs and auction catalogues in one workspace.</p>
          </div>

          <div style={styles.pillRow}>
            <span className="market-page-count">
              {viewMode === 'calendar'
                ? `${calendarEntryCount} sales`
                : `${displaySections.length} sections`}
            </span>
            <button
              type="button"
              onClick={() => setViewMode('sections')}
              aria-pressed={viewMode === 'sections'}
              style={{
                ...styles.sortButton,
                ...(viewMode === 'sections' ? styles.sortButtonActive : {}),
              }}
            >
              Sections
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              aria-pressed={viewMode === 'calendar'}
              style={{
                ...styles.sortButton,
                ...(viewMode === 'calendar' ? styles.sortButtonActive : {}),
              }}
            >
              Auction calendar
            </button>
          </div>
        </div>

        {message ? <div style={styles.alertSuccess}>{message}</div> : null}
        {errorMessage ? <div style={styles.alertError}>{errorMessage}</div> : null}




{viewMode === 'calendar' ? (
  <div style={styles.card}>
    <div style={styles.cardHeader}>
      <h2 style={styles.cardTitle}>Auction calendar — local time</h2>
      <p style={styles.cardSubtitle}>Future sales grouped by Art Market section. Select a sale title to open its link.</p>
    </div>
    <div style={styles.cardBody}>
      {loading ? (
        <div style={styles.emptyBox}>Loading…</div>
      ) : calendarEntryCount === 0 ? (
        <div style={styles.emptyBox}>No future sales found. Add an auction date to a market resource to show it here.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            aria-label="Auction calendar"
            style={{ width: '100%', minWidth: canEdit ? '940px' : '760px', borderCollapse: 'collapse', textAlign: 'left' }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
                <th scope="col" style={{ padding: '12px 10px' }}>Date</th>
                <th scope="col" style={{ padding: '12px 10px' }}>Time (local time)</th>
                <th scope="col" style={{ padding: '12px 10px' }}>Auction house</th>
                {canEdit ? (
                  <th scope="col" style={{ padding: '12px 10px' }}>Catalogue</th>
                ) : null}
                {canEdit ? (
                  <th scope="col" style={{ padding: '12px 10px' }}>Paddle/Places</th>
                ) : null}
                <th scope="col" style={{ padding: '12px 10px' }}>Sale</th>
              </tr>
            </thead>
            <tbody>
              {calendarSections.map((section) => (
                <Fragment key={section.id}>
                  <tr>
                    <th
                      colSpan={canEdit ? 6 : 4}
                      scope="colgroup"
                      style={{
                        padding: '12px 10px',
                        background: '#e8eee9',
                        color: '#143b2d',
                        fontSize: '16px',
                        textTransform: 'capitalize',
                      }}
                    >
                      {section.title}
                    </th>
                  </tr>
                  {section.items.map((item) => {
                    const href = getItemHref(item);
                    const { auctionDate, auctionTime } = parseAuctionDateTimeRaw(item.auction_datetime);
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
                          {formatCalendarDate(auctionDate)}
                        </td>
                        <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
                          {auctionTime || '—'}
                        </td>
                        <td
                          style={{
                            padding: '12px 10px',
                            whiteSpace: 'nowrap',
                            color: getAuctionHouseColor(item.auction_house),
                            fontWeight: 700,
                          }}
                        >
                          {item.auction_house || '—'}
                        </td>
                        {canEdit ? (
                          <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            <select
                              aria-label={`Catalogue status for ${item.label}`}
                              value={item.catalogue_status ?? ''}
                              onChange={(e) =>
                                void handleCatalogueStatusChange(item.id, e.target.value)
                              }
                              disabled={saving}
                              style={{ ...styles.input, minWidth: '130px' }}
                            >
                              <option value="">Not specified</option>
                              <option value="Yes">Yes</option>
                              <option value="No">No</option>
                              <option value="Received">Received</option>
                              <option value="Printed">Printed</option>
                            </select>
                          </td>
                        ) : null}
                        {canEdit ? (
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <select
                              aria-label={`Paddle/Places for ${item.label}`}
                              value={item.paddle_places ?? ''}
                              onChange={(e) =>
                                void handlePaddlePlacesChange(item.id, e.target.value)
                              }
                              disabled={saving}
                              style={{ ...styles.input, minWidth: '120px' }}
                            >
                              <option value="">Select</option>
                              <option value="No">No</option>
                              <option value="Yes 1">Yes 1</option>
                              <option value="Yes 2">Yes 2</option>
                            </select>
                          </td>
                        ) : null}
                        <td style={{ padding: '12px 10px', minWidth: '280px' }}>
                          {href !== '#' ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#0f172a', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                            >
                              {item.label}
                            </a>
                          ) : (
                            item.label
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>
) : (
<div style={styles.sectionList}>
  {loading ? (
    <div style={styles.card}>
      <div style={styles.cardBody}>Loading…</div>
    </div>
  ) : displaySections.length === 0 ? (
    <div style={styles.card}>
      <div style={styles.cardBody}>No sections found for this filter.</div>
    </div>
  ) : (
    displaySections.map((section, index) => {
      const sectionIsPast = isPastSection(section, todayDate);
      const startsPeriod =
        index === 0 ||
        isPastSection(displaySections[index - 1], todayDate) !== sectionIsPast;
      const isExpanded = expandedSections[section.id] ?? false;

      return (
        <Fragment key={section.id}>
        {startsPeriod && sectionIsPast ? (
          <div
            role="separator"
            aria-orientation="horizontal"
            style={{
              width: '100%',
              height: '2px',
              flexShrink: 0,
              backgroundColor: '#a3b0aa',
              margin: '8px 0 0',
            }}
          />
        ) : null}
        {startsPeriod ? (
          <h2
            style={{
              margin: sectionIsPast ? 0 : '8px 0 0',
              background: '#143b2d',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '28px',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            {sectionIsPast ? 'Past' : 'Future'}
          </h2>
        ) : null}
        <div style={{ ...styles.card, background: '#f5f6f5' }}>
          <div style={styles.cardHeader}>
            <div style={styles.sectionHeaderRow}>
              <div style={{ minWidth: 0 }}>
                <div style={styles.sectionTitleRow}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    style={styles.toggleButton}
                    aria-label={isExpanded ? 'Replier la section' : 'Déplier la section'}
                  >
                    {isExpanded ? '−' : '+'}
                  </button>

                  <h2 style={styles.sectionTitleText}>{section.title}</h2>
                </div>

                <div style={{ ...styles.metaRow, marginTop: '8px' }}>
                  <span>{formatDateRange(section.start_date, section.end_date)}</span>
                  <span>
                    📁 {section.items.length} ressource{section.items.length > 1 ? 's' : ''}
                  </span>
                </div>

                {section.notes ? (
                  <p style={{ ...styles.noteText, marginTop: '10px' }}>
                    <LinkedText text={section.notes} />
                  </p>
                ) : null}
              </div>

              <div style={styles.sectionActions}>




  <div style={styles.sortButtonsContainer}>
    {section.category === 'Ventes aux enchères' && (
      <button
        type="button"
        onClick={() =>
          setSectionSortModes((prev) => ({
            ...prev,
            [section.id]: 'auction_datetime_asc',
          }))
        }
        style={{
          ...styles.sortButton,
          ...(getSectionSortMode(section) === 'auction_datetime_asc'
            ? styles.sortButtonActive
            : {}),
        }}
      >
        Sale Date
      </button>
    )}

    <button
      type="button"
      onClick={() =>
        setSectionSortModes((prev) => ({
          ...prev,
          [section.id]: 'label_asc',
        }))
      }
      style={{
        ...styles.sortButton,
        ...(getSectionSortMode(section) === 'label_asc'
          ? styles.sortButtonActive
          : {}),
      }}
    >
      Alpha
    </button>

    <button
      type="button"
      onClick={() =>
        setSectionSortModes((prev) => ({
          ...prev,
          [section.id]: 'created_desc',
        }))
      }
      style={{
        ...styles.sortButton,
        ...(getSectionSortMode(section) === 'created_desc'
          ? styles.sortButtonActive
          : {}),
      }}
    >
      Création
    </button>
  </div>

  {canEdit ? (
    <>
      <button
        type="button"
        onClick={() => startSectionEdit(section)}
        disabled={saving}
        style={getButtonStyle('secondary', saving)}
        aria-label={`Edit ${section.title}`}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => handleDeleteSection(section.id)}
        disabled={saving}
        style={getButtonStyle('danger', saving)}
      >
        <span>🗑</span>
        <span>Section</span>
      </button>
    </>
  ) : null}
</div>


              </div>
            </div>

          {sectionEditState?.id === section.id ? (
            <div style={styles.cardBody}>
              <form onSubmit={handleSaveSectionEdit} style={styles.formStack}>
                <div>
                  <label htmlFor={`section-title-${section.id}`} style={styles.label}>Title</label>
                  <input
                    id={`section-title-${section.id}`}
                    value={sectionEditState.title}
                    onChange={(e) =>
                      setSectionEditState((prev) =>
                        prev ? { ...prev, title: e.target.value } : prev
                      )
                    }
                    style={styles.input}
                    required
                  />
                </div>

                <div style={twoColumnsResponsiveStyle}>
                  <div>
                    <label htmlFor={`section-category-${section.id}`} style={styles.label}>Category</label>
                    <select
                      id={`section-category-${section.id}`}
                      value={sectionEditState.category}
                      onChange={(e) =>
                        setSectionEditState((prev) =>
                          prev
                            ? { ...prev, category: e.target.value as MarketCategory }
                            : prev
                        )
                      }
                      style={styles.input}
                    >
                      <option value="Foire">Fair</option>
                      <option value="Ventes aux enchères">Auction</option>
                      <option value="Autre">Other</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`section-start-date-${section.id}`} style={styles.label}>Start date</label>
                    <input
                      id={`section-start-date-${section.id}`}
                      type="date"
                      value={sectionEditState.startDate}
                      onChange={(e) =>
                        setSectionEditState((prev) =>
                          prev ? { ...prev, startDate: e.target.value } : prev
                        )
                      }
                      style={styles.input}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor={`section-end-date-${section.id}`} style={styles.label}>End date</label>
                  <input
                    id={`section-end-date-${section.id}`}
                    type="date"
                    value={sectionEditState.endDate}
                    onChange={(e) =>
                      setSectionEditState((prev) =>
                        prev ? { ...prev, endDate: e.target.value } : prev
                      )
                    }
                    style={styles.input}
                  />
                </div>

                <div>
                  <label htmlFor={`section-notes-${section.id}`} style={styles.label}>Notes</label>
                  <textarea
                    id={`section-notes-${section.id}`}
                    value={sectionEditState.notes}
                    onChange={(e) =>
                      setSectionEditState((prev) =>
                        prev ? { ...prev, notes: e.target.value } : prev
                      )
                    }
                    rows={4}
                    style={styles.textarea}
                  />
                </div>

                <div style={styles.formActionsRight}>
                  <button
                    type="button"
                    onClick={cancelSectionEdit}
                    disabled={saving}
                    style={getButtonStyle('secondary', saving)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={getButtonStyle('primary', saving)}
                  >
                    Save changes
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {isExpanded ? (
            <div style={styles.cardBody}>
              {section.items.length === 0 ? (
                <div style={styles.emptyBox}>No resources in this section.</div>
              ) : (
                <div style={styles.itemList}>
                  {section.items.map((item) => {
                    const href = getItemHref(item);
                    const canOpen = href !== '#';
                    const isEditing =
                      editingItemId === item.id && editState?.id === item.id;

                    return (
                      <div key={item.id} style={styles.itemCard}>
                        {!isEditing ? (
                          <>
                            <div style={styles.itemContent}>
                              <div style={styles.itemHeaderRow}>
                                {canOpen ? (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={styles.itemLinkActive}
                                  >
                                    {item.label}
                                  </a>
                                ) : (
                                  <div style={styles.itemLinkInactive}>{item.label}</div>
                                )}
                              </div>

                              {item.auction_house || item.auction_datetime || (canEdit && item.catalogue_status) ? (
                                <div style={styles.itemHeaderRow}>
                                  {item.auction_house ? (
                                    <span style={styles.itemMetaText}>{item.auction_house}</span>
                                  ) : null}
                                  {canEdit && item.catalogue_status ? (
                                    <span style={styles.itemMetaText}>Catalogue: {item.catalogue_status}</span>
                                  ) : null}
                                  {item.auction_datetime ? (
                                    <span style={styles.itemMetaText}>
                                      {formatAuctionDateTimeLocal(item.auction_datetime)}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}

                              {item.notes ? (
                                <p style={styles.itemSecondaryText}><LinkedText text={item.notes} /></p>
                              ) : null}

                            </div>

                            <div style={styles.rightActions}>
                              {canEdit ? (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                      <label
                                        htmlFor={`catalogue-status-${item.id}`}
                                        style={{ ...styles.label, marginBottom: 0 }}
                                      >
                                        Catalogue
                                      </label>
                                      <select
                                        id={`catalogue-status-${item.id}`}
                                        aria-label={`Catalogue status for ${item.label}`}
                                        value={item.catalogue_status ?? ''}
                                        onChange={(e) =>
                                          void handleCatalogueStatusChange(item.id, e.target.value)
                                        }
                                        disabled={saving}
                                        style={{ ...styles.input, width: 'auto', minWidth: '130px' }}
                                      >
                                        <option value="">Not specified</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                        <option value="Received">Received</option>
                                        <option value="Printed">Printed</option>
                                      </select>
                                    </div>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                      <label
                                        htmlFor={`paddle-places-${item.id}`}
                                        style={{ ...styles.label, marginBottom: 0 }}
                                      >
                                        Paddle/Places
                                      </label>
                                      <select
                                        id={`paddle-places-${item.id}`}
                                        aria-label={`Paddle/Places for ${item.label}`}
                                        value={item.paddle_places ?? ''}
                                        onChange={(e) =>
                                          void handlePaddlePlacesChange(item.id, e.target.value)
                                        }
                                        disabled={saving}
                                        style={{ ...styles.input, width: 'auto', minWidth: '130px' }}
                                      >
                                        <option value="">Not specified</option>
                                        <option value="No">No</option>
                                        <option value="Yes 1">Yes 1</option>
                                        <option value="Yes 2">Yes 2</option>
                                      </select>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => startInlineEdit(item)}
                                    disabled={saving}
                                    style={getButtonStyle('secondary', saving)}
                                    aria-label={`Edit ${item.label}`}
                                  >
                                    ✏️ 
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item.id)}
                                    disabled={saving}
                                    style={getButtonStyle('danger', saving)}
                                  >
                                    🗑 
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </>
                        ) : editState ? (
                          <div style={{ width: '100%' }}>
                            <div style={styles.formStack}>
                              <div style={twoColumnsResponsiveStyle}>
                                <div>
                                  <label style={styles.label}>Label</label>
                                  <input
                                    value={editState.label}
                                    onChange={(e) =>
                                      setEditState((prev) =>
                                        prev ? { ...prev, label: e.target.value } : prev
                                      )
                                    }
                                    style={styles.input}
                                  />
                                </div>

                                <div>
                                  <label style={styles.label}>
                                    {item.item_type === 'document'
                                      ? 'Lien OneDrive / PDF'
                                      : 'Lien internet'}
                                  </label>
                                  {isSharePointDocument(item) ? (
                                    <div style={{ ...styles.input, color: '#666' }}>
                                      Fichier stocké dans SharePoint
                                    </div>
                                  ) : (
                                    <input
                                      value={editState.url}
                                      onChange={(e) =>
                                        setEditState((prev) =>
                                          prev ? { ...prev, url: e.target.value } : prev
                                        )
                                      }
                                      style={styles.input}
                                    />
                                  )}
                                </div>
                              </div>

                              <div style={twoColumnsResponsiveStyle}>
                                <div>
                                  <label style={styles.label}>Date d’ajout</label>
                                  <input
                                    type="date"
                                    value={editState.addedAt}
                                    onChange={(e) =>
                                      setEditState((prev) =>
                                        prev ? { ...prev, addedAt: e.target.value } : prev
                                      )
                                    }
                                    style={styles.input}
                                  />
                                </div>

                                {item.item_type === 'document' ? (
                                  <div>
                                    <label style={styles.label}>Type de document</label>
                                    <select
                                      value={editState.documentType}
                                      onChange={(e) =>
                                        setEditState((prev) =>
                                          prev
                                            ? { ...prev, documentType: e.target.value }
                                            : prev
                                        )
                                      }
                                      style={styles.input}
                                    >
                                      <option value="market_pdf">Preview / PDF marché</option>
                                      <option value="auction_catalogue">
                                        Catalogue de vente
                                      </option>
                                      <option value="fair_preview">Preview de foire</option>
                                    </select>
                                  </div>
                                ) : (
                                  <div>
                                    <label style={styles.label}>Type</label>
                                    <input
                                      value="Lien web"
                                      disabled
                                      style={{ ...styles.input, background: '#f8fafc' }}
                                    />
                                  </div>
                                )}
                              </div>

                              <div>
                                <label style={styles.label}>Maison de ventes</label>
                                <input
                                  value={editState.auctionHouse}
                                  onChange={(e) =>
                                    setEditState((prev) =>
                                      prev ? { ...prev, auctionHouse: e.target.value } : prev
                                    )
                                  }
                                  style={styles.input}
                                />
                              </div>

                              <div>
                                <label htmlFor={`item-catalogue-${item.id}`} style={styles.label}>Catalogue</label>
                                <select
                                  id={`item-catalogue-${item.id}`}
                                  value={editState.catalogueStatus}
                                  onChange={(e) =>
                                    setEditState((prev) =>
                                      prev
                                        ? { ...prev, catalogueStatus: e.target.value as CatalogueStatus | '' }
                                        : prev
                                    )
                                  }
                                  style={styles.input}
                                >
                                  <option value="">Not specified</option>
                                  <option value="Yes">Yes</option>
                                  <option value="No">No</option>
                                  <option value="Received">Received</option>
                                  <option value="Printed">Printed</option>
                                </select>
                              </div>

                              <div style={twoColumnsResponsiveStyle}>
                                <div>
                                  <label style={styles.label}>Date de vente</label>
                                  <input
                                    type="date"
                                    value={editState.auctionDate}
                                    onChange={(e) =>
                                      setEditState((prev) =>
                                        prev ? { ...prev, auctionDate: e.target.value } : prev
                                      )
                                    }
                                    style={styles.input}
                                  />
                                </div>

                                <div>
                                  <label style={styles.label}>Heure de vente locale</label>
                                  <input
                                    type="time"
                                    value={editState.auctionTime}
                                    onChange={(e) =>
                                      setEditState((prev) =>
                                        prev ? { ...prev, auctionTime: e.target.value } : prev
                                      )
                                    }
                                    style={styles.input}
                                  />
                                </div>
                              </div>

                              <div>
                                <label style={styles.label}>Notes</label>
                                <textarea
                                  value={editState.notes}
                                  onChange={(e) =>
                                    setEditState((prev) =>
                                      prev ? { ...prev, notes: e.target.value } : prev
                                    )
                                  }
                                  rows={4}
                                  style={styles.textarea}
                                />
                              </div>

                              <div style={styles.formActionsRight}>
                                <button
                                  type="button"
                                  onClick={cancelInlineEdit}
                                  disabled={saving}
                                  style={getButtonStyle('secondary', saving)}
                                >
                                  Annuler
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineEdit(item)}
                                  disabled={saving}
                                  style={getButtonStyle('primary', saving)}
                                >
                                  Enregistrer
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
        </Fragment>
      );
    })
  )}
</div>
)}


        {canEdit && viewMode === 'sections' ? (
          <>
          <div
            className="no-print"
            role="separator"
            aria-orientation="horizontal"
            style={{
              width: '100%',
              height: '2px',
              flexShrink: 0,
              backgroundColor: '#a3b0aa',
              marginTop: '8px',
            }}
          />
          <h2
            className="no-print"
            style={{
              margin: 0,
              color: '#143b2d',
              fontSize: '28px',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            New
          </h2>
          <div className="no-print" style={twoColumnsResponsiveStyle}>
            <div style={{ ...styles.card, background: '#f5f6f5' }}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Nouvelle section</h2>
                <p style={styles.cardSubtitle}>
                  Ex. Art Basel 2026, Auctions May NY, Frieze London 2026.
                </p>
              </div>

              <div style={styles.cardBody}>
                <form onSubmit={handleCreateSection} style={styles.formStack}>
                  <div>
                    <label htmlFor="section-title" style={styles.label}>Titre</label>
                    <input
                      id="section-title"
                      value={sectionForm.title}
                      onChange={(e) =>
                        setSectionForm((prev) => ({ ...prev, title: e.target.value }))
                      }
                      placeholder="Art Basel 2026"
                      style={styles.input}
                    />
                  </div>

                  <div>
                    <label style={styles.label}>Catégorie</label>
                    <select
                      value={sectionForm.category}
                      onChange={(e) =>
                        setSectionForm((prev) => ({ ...prev, category: e.target.value as MarketCategory }))
                      }
                      style={styles.input}
                    >
                      <option value="Foire">Foire</option>
                      <option value="Ventes aux enchères">Ventes aux enchères</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>

                  <div style={twoColumnsResponsiveStyle}>
                    <div>
                      <label htmlFor="section-start-date" style={styles.label}>Date de début</label>
                      <input
                        id="section-start-date"
                        type="date"
                        value={sectionForm.startDate}
                        onChange={(e) =>
                          setSectionForm((prev) => ({ ...prev, startDate: e.target.value }))
                        }
                        style={styles.input}
                      />
                    </div>

                    <div>
                      <label htmlFor="section-end-date" style={styles.label}>Date de fin</label>
                      <input
                        id="section-end-date"
                        type="date"
                        value={sectionForm.endDate}
                        onChange={(e) =>
                          setSectionForm((prev) => ({ ...prev, endDate: e.target.value }))
                        }
                        style={styles.input}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="section-notes" style={styles.label}>Notes</label>
                    <textarea
                      id="section-notes"
                      value={sectionForm.notes}
                      onChange={(e) =>
                        setSectionForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      placeholder="Notes internes — URL ou [libellé](https://...)"
                      rows={4}
                      style={styles.textarea}
                    />
                  </div>

                  <div style={styles.formActionsRight}>
                    <button type="submit" disabled={saving} style={getButtonStyle('primary', saving)}>
                      <span>+</span>
                      <span>Créer la section</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div style={{ ...styles.card, background: '#f5f6f5' }}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Ajouter une ressource</h2>
                <p style={styles.cardSubtitle}>
                  Lien internet ou PDF / OneDrive. Pour les ventes, tu peux aussi renseigner la maison de ventes et l’heure locale de la vacation.
                </p>
              </div>

              <div style={styles.cardBody}>
                <form onSubmit={handleCreateItem} style={styles.formStack}>
                  <div>
                    <label style={styles.label}>Section</label>
                    <select
                      value={itemForm.sectionId}
                      onChange={(e) =>
                        setItemForm((prev) => ({ ...prev, sectionId: e.target.value }))
                      }
                      style={styles.input}
                    >
                      <option value="">Choisir une section</option>
                      {sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={styles.label}>Type</label>
                    <select
                      value={itemForm.itemType}
                      onChange={(e) =>
                        setItemForm((prev) => ({ ...prev, itemType: e.target.value as MarketItemType }))
                      }
                      style={styles.input}
                    >
                      <option value="web_link">Lien web</option>
                      <option value="document">PDF / OneDrive</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="item-label" style={styles.label}>Label</label>
                    <input
                      id="item-label"
                      value={itemForm.label}
                      onChange={(e) =>
                        setItemForm((prev) => ({ ...prev, label: e.target.value }))
                      }
                      placeholder="Preview Galerie X / Evening Sale Catalogue"
                      style={styles.input}
                    />
                  </div>

                  {itemForm.itemType === 'document' ? (
                    <div>
                      <label style={styles.label}>Fichier (upload SharePoint)</label>
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingFile(true);
                        }}
                        onDragLeave={() => setIsDraggingFile(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDraggingFile(false);
                          const dropped = e.dataTransfer.files?.[0];
                          if (dropped) setItemFile(dropped);
                        }}
                        style={{
                          border: `2px dashed ${isDraggingFile ? '#0b5d2a' : '#999'}`,
                          backgroundColor: isDraggingFile ? '#eaf6ee' : '#fff',
                          borderRadius: 6,
                          padding: 16,
                          textAlign: 'center',
                        }}
                      >
                        {itemFile ? (
                          <div>
                            <strong>{itemFile.name}</strong>{' '}
                            <button type="button" onClick={() => setItemFile(null)}>
                              Retirer
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div>Glissez un fichier ici</div>
                            <label style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                              ou choisir un fichier
                              <input
                                type="file"
                                hidden
                                onChange={(e) => {
                                  const picked = e.target.files?.[0];
                                  e.target.value = '';
                                  if (picked) setItemFile(picked);
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="item-url" style={styles.label}>
                      {itemForm.itemType === 'document' ? 'Ou lien OneDrive / PDF' : 'Lien internet'}
                    </label>
                    <input
                      id="item-url"
                      value={itemForm.url}
                      disabled={itemForm.itemType === 'document' && Boolean(itemFile)}
                      onChange={(e) =>
                        setItemForm((prev) => ({ ...prev, url: e.target.value }))
                      }
                      placeholder={itemForm.itemType === 'document' ? 'https://... vers le PDF OneDrive' : 'https://...'}
                      style={styles.input}
                    />
                  </div>

                  {itemForm.itemType === 'document' ? (
                    <div>
                      <label style={styles.label}>Type de document</label>
                      <select
                        value={itemForm.documentType}
                        onChange={(e) =>
                          setItemForm((prev) => ({ ...prev, documentType: e.target.value }))
                        }
                        style={styles.input}
                      >
                        <option value="market_pdf">Preview / PDF marché</option>
                        <option value="auction_catalogue">Catalogue de vente</option>
                        <option value="fair_preview">Preview de foire</option>
                      </select>
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="item-added-at" style={styles.label}>Date d’ajout</label>
                    <input
                      id="item-added-at"
                      type="date"
                      value={itemForm.addedAt}
                      onChange={(e) =>
                        setItemForm((prev) => ({ ...prev, addedAt: e.target.value }))
                      }
                      style={styles.input}
                    />
                  </div>

                  <div>
                    <label htmlFor="item-auction-house" style={styles.label}>Maison de ventes</label>
                    <input
                      id="item-auction-house"
                      value={itemForm.auctionHouse}
                      onChange={(e) =>
                        setItemForm((prev) => ({ ...prev, auctionHouse: e.target.value }))
                      }
                      placeholder="Auction House"
                      style={styles.input}
                    />
                  </div>

                  <div>
                    <label htmlFor="item-catalogue" style={styles.label}>Catalogue</label>
                    <select
                      id="item-catalogue"
                      value={itemForm.catalogueStatus}
                      onChange={(e) =>
                        setItemForm((prev) => ({
                          ...prev,
                          catalogueStatus: e.target.value as CatalogueStatus | '',
                        }))
                      }
                      style={styles.input}
                    >
                      <option value="">Not specified</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                      <option value="Received">Received</option>
                      <option value="Printed">Printed</option>
                    </select>
                  </div>

                  <div style={twoColumnsResponsiveStyle}>
                    <div>
                      <label htmlFor="item-auction-date" style={styles.label}>Date de vente</label>
                      <input
                        id="item-auction-date"
                        type="date"
                        value={itemForm.auctionDate}
                        onChange={(e) =>
                          setItemForm((prev) => ({ ...prev, auctionDate: e.target.value }))
                        }
                        style={styles.input}
                      />
                      <p style={styles.helperText}>Past dates can still be entered; the calendar only shows future sales.</p>
                    </div>

                    <div>
                      <label htmlFor="item-auction-time" style={styles.label}>Heure de vente locale</label>
                      <input
                        id="item-auction-time"
                        type="time"
                        value={itemForm.auctionTime}
                        onChange={(e) =>
                          setItemForm((prev) => ({ ...prev, auctionTime: e.target.value }))
                        }
                        style={styles.input}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="item-notes" style={styles.label}>Notes</label>
                    <textarea
                      id="item-notes"
                      value={itemForm.notes}
                      onChange={(e) =>
                        setItemForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      placeholder="Commentaire interne"
                      rows={4}
                      style={styles.textarea}
                    />
                  </div>

                  <div style={styles.formActionsRight}>
                    <button
                      type="submit"
                      disabled={saving || sections.length === 0}
                      style={getButtonStyle('primary', saving || sections.length === 0)}
                    >
                      <span>+</span>
                      <span>Ajouter la ressource</span>
                    </button>
                  </div>

                  {sections.length === 0 ? <p style={styles.helperText}>Crée d’abord une section avant d’ajouter une ressource.</p> : null}
                </form>
              </div>
            </div>
          </div>
          </>
        ) : null}
      </div>
    </div>
    </main>
  );
}
