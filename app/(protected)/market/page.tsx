
'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabaseBrowser';

type ProfileRole = 'Administrator' | 'Editor' | 'Viewer' | null;

type MarketCategory = 'Foire' | 'Ventes aux enchères' | 'Autre';
type MarketCategoryFilter = 'Tous' | MarketCategory;
type MarketItemType = 'web_link' | 'document';
type ItemSortMode = 'label_asc' | 'created_asc' | 'auction_datetime_asc';

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

function formatCreatedAt(dateTime?: string | null) {
  if (!dateTime) return '—';
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return '—';

  return d.toLocaleString('fr-CH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return 'Dates non précisées';
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return `Dès ${formatDate(start)}`;
  return `Jusqu’au ${formatDate(end)}`;
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

function getItemTypeLabel(item: MarketSectionItemView) {
  return item.item_type === 'document' ? 'PDF / OneDrive' : 'Lien web';
}

function sortSections(a: SectionWithItems, b: SectionWithItems) {
  const aDate = a.start_date ?? '9999-12-31';
  const bDate = b.start_date ?? '9999-12-31';

  if (aDate < bDate) return -1;
  if (aDate > bDate) return 1;

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

      if (a.created_at < b.created_at) return -1;
      if (a.created_at > b.created_at) return 1;

      return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });
    }

    // creation order = ordre réel de création (ancien -> récent)
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;

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
  };
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: '1200px',
    marginTop: 50,
    padding: '24px 16px 40px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: 'white',
    background: "#006039",
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
    fontSize: '28px',
    fontWeight: 600,
    lineHeight: 1.2,
  },
  subtitle: {
    margin: '6px 0 0 0',
    color: 'white',
    fontSize: '14px',
  },
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    background: '#ffffff',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#334155',
  },
    pillAuction: {
    display: 'inline-flex',
    alignItems: 'center',
    background: '#ffffff',
    padding: '0px 0px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#334155',
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
    border: '1px solid #cbd5e1',
    borderRadius: '12px',
    background: '#ffffff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
    cardFilter: {
    border: '1px solid #cbd5e1',
    borderRadius: '12px',
    backgroundColor: '#DCEFE7',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
  cardHeader: {
    borderBottom: '1px solid #e2e8f0',
    padding: '18px 20px 14px',
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
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 220px 260px auto',
    gap: '16px',
    alignItems: 'end',
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
  searchContainer: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#94a3b8',
    fontSize: '14px',
    pointerEvents: 'none',
  },
  inputWithIcon: {
    paddingLeft: '34px',
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  buttonPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 14px',
    background: '#0f172a',
    color: '#ffffff',
    border: '1px solid #0f172a',
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
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    cursor: 'pointer',
    color: '#334155',
    fontSize: '14px',
  },
  sectionTitleText: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 600,
  },
  categoryBadgeBase: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: 600,
  },
  categoryFair: {
    border: '1px solid #bfdbfe',
    background: '#eff6ff',
    color: '#1d4ed8',
  },
  categoryAuction: {
    border: '1px solid #fde68a',
    background: '#fffbeb',
    color: '#b45309',
  },
  categoryOther: {
    border: '1px solid #cbd5e1',
    background: '#f8fafc',
    color: '#475569',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    color: '#475569',
    fontSize: '14px',
  },
  noteText: {
    margin: 0,
    maxWidth: '850px',
    color: '#475569',
    fontSize: '14px',
    lineHeight: 1.6,
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
    fontWeight: 600,
  },
  itemLinkInactive: {
    color: '#0f172a',
    fontWeight: 600,
  },
  itemSecondaryText: {
    margin: 0,
    color: '#475569',
    fontSize: '14px',
    lineHeight: 1.6,
  },
  rightActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  sixteendown: {
    marginTop: '16px',
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
  gap: '8px',
  flexWrap: 'wrap',
},
sortSelect: {
  minWidth: '220px',
  maxWidth: '260px',
},
inlineLabel: {
  marginBottom: 0,
  whiteSpace: 'nowrap',
},

};

function getCategoryStyle(category: MarketCategory): CSSProperties {
  if (category === 'Foire') {
    return { ...styles.categoryBadgeBase, ...styles.categoryFair };
  }
  if (category === 'Ventes aux enchères') {
    return { ...styles.categoryBadgeBase, ...styles.categoryAuction };
  }
  return { ...styles.categoryBadgeBase, ...styles.categoryOther };
}

function getButtonStyle(kind: 'primary' | 'secondary' | 'danger', disabled = false): CSSProperties {
  const base = kind === 'primary'
    ? styles.buttonPrimary
    : kind === 'danger'
      ? styles.buttonDanger
      : styles.buttonSecondary;

  return disabled ? { ...base, ...styles.disabledButton } : base;
}

export default function MarketPage() {
  const [role, setRole] = useState<ProfileRole>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sections, setSections] = useState<SectionWithItems[]>([]);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<MarketCategoryFilter>('Tous');
  const [sectionSortModes, setSectionSortModes] = useState<Record<string, ItemSortMode>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
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
  });

  const canEdit = role === 'Administrator' || role === 'Editor';

  
function getDefaultSortMode(section: MarketSection): ItemSortMode {
  return section.category === 'Ventes aux enchères'
    ? 'auction_datetime_asc'
    : 'created_asc';
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
          .order('start_date', { ascending: true, nullsFirst: false })
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

      merged.forEach((section, index) => {
        if (typeof next[section.id] === 'undefined') {
          next[section.id] = index < 4;
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

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();

    return sections
      .filter((section) => {
        if (categoryFilter !== 'Tous' && section.category !== categoryFilter) {
          return false;
        }

        if (!q) return true;

        const haystack = [
          section.title,
          section.category,
          section.notes ?? '',
          ...section.items.flatMap((item) => [
            item.label,
            item.notes ?? '',
            item.web_url ?? '',
            item.document_url ?? '',
            item.document_type ?? '',
            item.auction_house ?? '',
            item.auction_datetime ?? '',
          ]),
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(q);
      })

.map((section) => ({
  ...section,
  items: sortItems(section.items, getSectionSortMode(section), section.category),
}));

  }, [sections, query, categoryFilter, sectionSortModes]);

  function toggleSection(sectionId: string) {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }

  function expandAll() {
    const next: Record<string, boolean> = {};
    filteredSections.forEach((section) => {
      next[section.id] = true;
    });
    setExpandedSections((prev) => ({ ...prev, ...next }));
  }

  function collapseAll() {
    const next: Record<string, boolean> = {};
    filteredSections.forEach((section) => {
      next[section.id] = false;
    });
    setExpandedSections((prev) => ({ ...prev, ...next }));
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

    if (!url) {
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
          url,
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

  async function handleCreateSection(e: React.FormEvent) {
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

  async function handleCreateItem(e: React.FormEvent) {
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
      }));

      setMessage('Lien ajouté.');
      setSaving(false);
      await loadData();
      return;
    }

    const documentUrl = itemForm.url.trim();

    if (!documentUrl) {
      setErrorMessage('L’URL OneDrive / PDF est obligatoire pour un document.');
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

    const { error: documentError } = await supabase.from('documents').insert({
      url: documentUrl,
      document_type: itemForm.documentType || 'market_pdf',
      market_section_item_id: itemData.id,
      position: 0,
      artwork_id: null,
    });

    if (documentError) {
      console.error('CREATE MARKET DOCUMENT ERROR raw:', documentError);
      console.error('CREATE MARKET DOCUMENT ERROR message:', documentError?.message);
      console.error('CREATE MARKET DOCUMENT ERROR details:', documentError?.details);
      console.error('CREATE MARKET DOCUMENT ERROR hint:', documentError?.hint);
      console.error('CREATE MARKET DOCUMENT ERROR code:', documentError?.code);

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
    }));

    setMessage('Document ajouté.');
    setSaving(false);
    await loadData();
  }

  async function handleDeleteItem(itemId: string) {
    if (!canEdit) return;

    const ok = window.confirm('Supprimer cette ressource ?');
    if (!ok) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

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

  const filterResponsiveStyle: CSSProperties = {
    ...styles.filterGrid,
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  };

  return (
    <div style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.title}>Art Market - Previews and auctions catalogues</h1>

          </div>

          <div style={styles.pillRow}>
            <span style={styles.pill}>Role : {role ?? '—'}</span>
            <span style={styles.pill}>{filteredSections.length} sections</span>
          </div>
        </div>

        {message ? <div style={styles.alertSuccess}>{message}</div> : null}
        {errorMessage ? <div style={styles.alertError}>{errorMessage}</div> : null}

        <div style={styles.cardFilter}>
          

          <div style={{ ...styles.cardBody, ...filterResponsiveStyle }}>
            <div>
              <label htmlFor="market-search" style={styles.label}>Search Items</label>
              <div style={styles.searchContainer}>
                <span style={styles.searchIcon}>🔎</span>
                <input
                  id="market-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for fairs, auctions, galleries, catalogues..."
                  style={{ ...styles.input, ...styles.inputWithIcon }}
                />
              </div>
            </div>

            <div>
              <label style={styles.label}>Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as MarketCategoryFilter)}
                style={styles.input}
              >
                <option value="Tous">All</option>
                <option value="Foire">Fairs</option>
                <option value="Ventes aux enchères">Auctions</option>
                <option value="Autre">Other</option>
              </select>
            </div>



            <div style={styles.buttonRow}>
              <button type="button" onClick={expandAll} style={getButtonStyle('secondary')}>
                Expand All
              </button>
              <button type="button" onClick={collapseAll} style={getButtonStyle('secondary')}>
                Collapse All
              </button>
            </div>
          </div>
        </div>


<div style={styles.sectionList}>
  {loading ? (
    <div style={styles.card}>
      <div style={styles.cardBody}>Loading…</div>
    </div>
  ) : filteredSections.length === 0 ? (
    <div style={styles.card}>
      <div style={styles.cardBody}>No sections found for this filter.</div>
    </div>
  ) : (
    filteredSections.map((section) => {
      const isExpanded = expandedSections[section.id] ?? true;

      return (
        <div key={section.id} style={styles.card}>
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
                  <span style={getCategoryStyle(section.category)}>{section.category}</span>
                </div>

                <div style={{ ...styles.metaRow, marginTop: '8px' }}>
                  <span>📅 {formatDateRange(section.start_date, section.end_date)}</span>
                  <span>
                    📁 {section.items.length} ressource{section.items.length > 1 ? 's' : ''}
                  </span>
                </div>

                {section.notes ? (
                  <p style={{ ...styles.noteText, marginTop: '10px' }}>{section.notes}</p>
                ) : null}
              </div>

              <div style={styles.sectionActions}>
                <label
                  htmlFor={`sort-${section.id}`}
                  style={{ ...styles.label, ...styles.inlineLabel }}
                >
                  Sort
                </label>

                <select
                  id={`sort-${section.id}`}
                  value={getSectionSortMode(section)}
                  onChange={(e) =>
                    setSectionSortModes((prev) => ({
                      ...prev,
                      [section.id]: e.target.value as ItemSortMode,
                    }))
                  }
                  style={{ ...styles.input, ...styles.sortSelect }}
                >
                  <option value="label_asc">Alphabetical</option>
                  <option value="created_asc">Creation order</option>
                  {section.category === 'Ventes aux enchères' ? (
                    <option value="auction_datetime_asc">Auction date</option>
                  ) : null}
                </select>

                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteSection(section.id)}
                    disabled={saving}
                    style={getButtonStyle('danger', saving)}
                  >
                    <span>🗑</span>
                    <span>Delete Section</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>

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
                            {item.auction_house || item.auction_datetime ? (
                              <div style={styles.itemHeaderRow}>
                                {item.auction_house ? (
                                  <span style={styles.pillAuction}>{item.auction_house}</span>
                                ) : null}
                                {item.auction_datetime ? (
                                  <span style={styles.pillAuction}>
                                    Date: {formatAuctionDateTimeLocal(item.auction_datetime)}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}

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

                                <span style={styles.pill}>
                                  Created: {formatCreatedAt(item.created_at)}
                                </span>
                              </div>

                              {item.notes ? (
                                <p style={styles.itemSecondaryText}>{item.notes}</p>
                              ) : null}
                            </div>

                            <div style={styles.rightActions}>
                              {canEdit ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startInlineEdit(item)}
                                    disabled={saving}
                                    style={getButtonStyle('secondary', saving)}
                                  >
                                    ✏️ Edit
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item.id)}
                                    disabled={saving}
                                    style={getButtonStyle('danger', saving)}
                                  >
                                    🗑 Delete
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
                                  <input
                                    value={editState.url}
                                    onChange={(e) =>
                                      setEditState((prev) =>
                                        prev ? { ...prev, url: e.target.value } : prev
                                      )
                                    }
                                    style={styles.input}
                                  />
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
      );
    })
  )}
</div>


        {canEdit ? (
          <div style={twoColumnsResponsiveStyle}>
            <div style={styles.card}>
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
                      placeholder="Notes internes sur la section"
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

            <div style={styles.card}>
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

                  <div>
                    <label htmlFor="item-url" style={styles.label}>
                      {itemForm.itemType === 'document' ? 'Lien OneDrive / PDF' : 'Lien internet'}
                    </label>
                    <input
                      id="item-url"
                      value={itemForm.url}
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
                      placeholder="Christie’s, Sotheby’s, Phillips..."
                      style={styles.input}
                    />
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
        ) : null}
      </div>
    </div>
  );
}
