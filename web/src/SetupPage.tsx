import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyTemplateEditorUpdates,
  fetchTemplateEditorItems,
  resetTemplateSetup,
  uploadTemplateAsset,
  type TemplateEditorApplyReportItem,
  type TemplateEditorItem,
} from './templateSetupApi';

type EditorTab = 'text' | 'image';

interface EditorDocument extends Document {
  __templateSetupClickHandler?: (event: Event) => void;
}

function updateBackgroundPreviewStyle(styleText: string, nextUrl: string) {
  const safeUrl = nextUrl.replace(/"/g, '\\"');
  const nextDeclaration = `background-image:url("${safeUrl}")`;

  if (/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i.test(styleText)) {
    return styleText.replace(
      /background-image\s*:\s*url\((['"]?)(.*?)\1\)/i,
      nextDeclaration
    );
  }

  const separator = styleText.trim().length === 0 || styleText.trim().endsWith(';') ? '' : ';';
  return `${styleText}${separator}${nextDeclaration}`;
}

function applyItemValueToPreview(
  item: TemplateEditorItem,
  nextValue: string,
  target: HTMLElement
) {
  if (item.source === 'iframe-src') {
    target.setAttribute('src', nextValue);
    return;
  }

  if (item.source === 'countdown-target') {
    const normalized = nextValue.trim();
    if (normalized) {
      target.setAttribute('data-countdown-target', normalized);
    } else {
      target.removeAttribute('data-countdown-target');
    }
    return;
  }

  if (item.source === 'qr-url') {
    const normalized = nextValue.trim();
    if (normalized) {
      target.setAttribute('data-qr-url', normalized);
    } else {
      target.removeAttribute('data-qr-url');
    }
    return;
  }

  if (
    item.source === 'text' ||
    item.source === 'runtime-text' ||
    item.source === 'map-address'
  ) {
    target.textContent = nextValue;
    return;
  }

  if (item.source === 'img-src') {
    target.setAttribute('src', nextValue);
    return;
  }

  const currentStyle = target.getAttribute('style') ?? '';
  const updatedStyle = updateBackgroundPreviewStyle(currentStyle, nextValue);
  target.setAttribute('style', updatedStyle);
}

function installPreviewEditorStyle(doc: Document) {
  const styleId = 'template42-setup-preview-style';
  const existing = doc.getElementById(styleId);
  if (existing) {
    return;
  }

  const style = doc.createElement('style');
  style.id = styleId;
  style.textContent = `
    [data-editor-item-id] {
      cursor: pointer !important;
      transition: outline-color 0.2s ease;
    }

    [data-editor-item-id].setup-editor-target {
      outline: 1px dashed rgba(23, 129, 190, 0.62);
      outline-offset: 2px;
    }

    [data-editor-item-id].setup-editor-selected {
      outline: 2px solid rgba(205, 78, 55, 0.98);
      outline-offset: 2px;
      box-shadow: 0 0 0 3px rgba(205, 78, 55, 0.2);
    }
  `;

  doc.head.appendChild(style);
}

function findTargetBySelector(doc: Document, selector: string) {
  try {
    const target = doc.querySelector(selector);
    return target instanceof HTMLElement ? target : null;
  } catch {
    return null;
  }
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extractGoogleMapsQuery(rawValue: string) {
  const normalized = rawValue.trim();
  if (!normalized) {
    return '';
  }

  try {
    const parsed = new URL(normalized, 'https://local-template.test');
    return (
      parsed.searchParams.get('q') ||
      parsed.searchParams.get('query') ||
      parsed.searchParams.get('destination') ||
      ''
    ).trim();
  } catch {
    return '';
  }
}

function buildGoogleMapsOpenUrl(item: TemplateEditorItem, rawValue: string) {
  const normalized = rawValue.trim();
  if (!normalized) {
    return '';
  }

  if (item.source === 'iframe-src') {
    const query = extractGoogleMapsQuery(normalized);
    if (query) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    }

    return normalized;
  }

  if (item.source === 'map-address') {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalized)}`;
  }

  return '';
}

function SetupPage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const itemsRef = useRef<TemplateEditorItem[]>([]);
  const focusPreviewOnSelectionRef = useRef(false);

  const [items, setItems] = useState<TemplateEditorItem[]>([]);
  const [projectName, setProjectName] = useState('Thiep cuoi Template 42');
  const [activeTab, setActiveTab] = useState<EditorTab>('text');
  const [searchText, setSearchText] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [strict, setStrict] = useState(true);
  const [report, setReport] = useState<TemplateEditorApplyReportItem[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(Date.now());
  const [previewFrameVersion, setPreviewFrameVersion] = useState(0);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const previewUrl = useMemo(
    () => `/template42-localized.html?editor=${previewNonce}`,
    [previewNonce]
  );

  const filteredItems = useMemo(() => {
    const keyword = normalizeSearchText(searchText.trim());

    return items.filter((item) => {
      if (item.type !== activeTab) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const targetText = normalizeSearchText(`${item.label} ${item.value} ${item.nodeId}`);
      return targetText.includes(keyword);
    });
  }, [activeTab, items, searchText]);

  const selectedItem = useMemo(() => {
    if (!selectedItemId) {
      return null;
    }

    return items.find((item) => item.id === selectedItemId) ?? null;
  }, [items, selectedItemId]);

  const changedCount = useMemo(() => {
    return items.reduce((sum, item) => {
      const draft = draftValues[item.id];
      if (typeof draft === 'undefined') {
        return sum;
      }
      return draft === item.value ? sum : sum + 1;
    }, 0);
  }, [draftValues, items]);

  const textCount = useMemo(
    () => items.filter((item) => item.type === 'text').length,
    [items]
  );

  const imageCount = useMemo(
    () => items.filter((item) => item.type === 'image').length,
    [items]
  );

  useEffect(() => {
    void loadEditorItems();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const savedName = window.localStorage.getItem('template42-editor-project-name');
    if (savedName && savedName.trim()) {
      setProjectName(savedName.trim());
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('template42-editor-project-name', projectName);
    document.title = `${projectName} | Template 42 Editor`;
  }, [projectName]);

  useEffect(() => {
    if (!filteredItems.length) {
      focusPreviewOnSelectionRef.current = false;
      setSelectedItemId(null);
      return;
    }

    if (!selectedItemId || !filteredItems.some((item) => item.id === selectedItemId)) {
      focusPreviewOnSelectionRef.current = false;
      setSelectedItemId(filteredItems[0].id);
    }
  }, [filteredItems, selectedItemId]);

  useEffect(() => {
    syncPreviewMarkup();
  }, [items, draftValues, selectedItemId, previewFrameVersion]);

  useEffect(() => {
    focusSelectedElementInPreview();
  }, [selectedItemId, previewFrameVersion]);

  async function loadEditorItems() {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const loadedItems = await fetchTemplateEditorItems();
      setItems(loadedItems);
      focusPreviewOnSelectionRef.current = false;
      setSelectedItemId((current) => {
        if (current && loadedItems.some((item) => item.id === current)) {
          return current;
        }

        const fallback =
          loadedItems.find((item) => item.type === activeTab) ?? loadedItems[0];
        return fallback?.id ?? null;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Khong tai duoc du lieu editor.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  function getCurrentValue(item: TemplateEditorItem) {
    return typeof draftValues[item.id] === 'string' ? draftValues[item.id] : item.value;
  }

  function updateDraftValue(item: TemplateEditorItem, nextValue: string) {
    setDraftValues((previous) => {
      const next = { ...previous };
      if (nextValue === item.value) {
        delete next[item.id];
      } else {
        next[item.id] = nextValue;
      }

      return next;
    });
  }

  function syncPreviewMarkup() {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) {
      return;
    }

    installPreviewEditorStyle(doc);

    const typedDoc = doc as EditorDocument;
    if (typedDoc.__templateSetupClickHandler) {
      doc.removeEventListener('click', typedDoc.__templateSetupClickHandler, true);
    }

    typedDoc.__templateSetupClickHandler = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const editableNode = target.closest('[data-editor-item-id]');
      if (!(editableNode instanceof HTMLElement)) {
        return;
      }

      const itemId = editableNode.getAttribute('data-editor-item-id');
      if (!itemId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const matchedItem = itemsRef.current.find((item) => item.id === itemId);
      if (!matchedItem) {
        return;
      }

      handleTabChange(matchedItem.type);
      selectItem(itemId, true);
    };

    doc.addEventListener('click', typedDoc.__templateSetupClickHandler, true);

    doc.querySelectorAll('.setup-editor-target').forEach((element) => {
      element.classList.remove('setup-editor-target');
    });
    doc.querySelectorAll('.setup-editor-selected').forEach((element) => {
      element.classList.remove('setup-editor-selected');
    });
    doc.querySelectorAll('[data-editor-item-id]').forEach((element) => {
      element.removeAttribute('data-editor-item-id');
    });

    for (const item of items) {
      const target = findTargetBySelector(doc, item.selector);
      if (!target) {
        continue;
      }

      target.setAttribute('data-editor-item-id', item.id);
      target.classList.add('setup-editor-target');
      applyItemValueToPreview(item, getCurrentValue(item), target);
    }

    if (!selectedItemId) {
      return;
    }

    const selectedElement = doc.querySelector(
      `[data-editor-item-id="${selectedItemId}"]`
    );
    if (!(selectedElement instanceof HTMLElement)) {
      return;
    }

    selectedElement.classList.add('setup-editor-selected');
  }

  function focusSelectedElementInPreview() {
    if (!focusPreviewOnSelectionRef.current) {
      return;
    }

    if (!selectedItemId) {
      focusPreviewOnSelectionRef.current = false;
      return;
    }

    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) {
      return;
    }

    const selectedElement = doc.querySelector(
      `[data-editor-item-id="${selectedItemId}"]`
    );
    if (!(selectedElement instanceof HTMLElement)) {
      return;
    }

    selectedElement.scrollIntoView({
      behavior: 'auto',
      block: 'center',
      inline: 'nearest',
    });

    focusPreviewOnSelectionRef.current = false;
  }

  function selectItem(itemId: string, shouldFocusPreview: boolean) {
    focusPreviewOnSelectionRef.current = shouldFocusPreview;
    setSelectedItemId(itemId);
  }

  function handleTabChange(nextTab: EditorTab) {
    focusPreviewOnSelectionRef.current = false;
    setActiveTab(nextTab);
  }

  function clearSelectedDraft() {
    if (!selectedItem) {
      return;
    }

    setDraftValues((previous) => {
      const next = { ...previous };
      delete next[selectedItem.id];
      return next;
    });
  }

  function handleOpenSelectedMapOnGoogleMaps() {
    if (!selectedItem) {
      return;
    }

    const lookupValue = getCurrentValue(selectedItem);
    const url = buildGoogleMapsOpenUrl(selectedItem, lookupValue);
    if (!url) {
      setErrorMessage('Khong the mo Google Maps vi gia tri dia chi/link dang rong.');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleApplyChanges() {
    setIsApplying(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const updates = items
        .map((item) => {
          const draftValue = draftValues[item.id];
          if (typeof draftValue === 'undefined' || draftValue === item.value) {
            return null;
          }

          return {
            id: item.id,
            value: draftValue,
          };
        })
        .filter((entry): entry is { id: string; value: string } => entry !== null);

      if (!updates.length) {
        setStatusMessage('Khong co thay doi moi de luu.');
        setReport([]);
        return;
      }

      const result = await applyTemplateEditorUpdates({
        strict,
        updates,
      });

      setReport(result.report);
      setStatusMessage(`${result.message} Tong so item da ap dung: ${result.totalApplied}.`);
      setDraftValues({});
      await loadEditorItems();
      setPreviewNonce(Date.now());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Khong the cap nhat template.';
      setErrorMessage(message);
    } finally {
      setIsApplying(false);
    }
  }

  async function handleResetTemplate() {
    if (!window.confirm('Khoi phuc ve ban backup? Tat ca thay doi da luu se bi ghi de.')) {
      return;
    }

    setIsResetting(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const result = await resetTemplateSetup();
      setStatusMessage(result.message);
      setReport([]);
      setDraftValues({});
      await loadEditorItems();
      setPreviewNonce(Date.now());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Khong the khoi phuc template.';
      setErrorMessage(message);
    } finally {
      setIsResetting(false);
    }
  }

  async function handleUploadAsset(file: File | undefined) {
    if (!file || !selectedItem || selectedItem.type !== 'image') {
      return;
    }

    setIsUploading(true);
    setErrorMessage('');

    try {
      const result = await uploadTemplateAsset(file);

      updateDraftValue(selectedItem, result.publicPath);
      setStatusMessage(`Tai anh len thanh cong: ${result.publicPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Khong tai len duoc anh.';
      setErrorMessage(message);
    } finally {
      setIsUploading(false);
    }
  }

  function handlePreviewLoaded() {
    setPreviewFrameVersion((previous) => previous + 1);
  }

  const selectedValue = selectedItem ? getCurrentValue(selectedItem) : '';

  return (
    <main className="setup-editor-shell">
      <header className="setup-toolbar">
        <div className="setup-toolbar-brand">
          <span className="setup-toolbar-logo" aria-hidden="true">
            CL
          </span>
          <div>
            <p className="setup-toolbar-title">Cinelove Editor</p>
            <p className="setup-toolbar-subtitle">Template 42 local workspace</p>
          </div>
        </div>

        <div className="setup-toolbar-naming">
          <label htmlFor="editor-project-name">Ten thiep</label>
          <div className="setup-toolbar-naming-control">
            <span className="setup-toolbar-naming-prefix">name</span>
            <input
              id="editor-project-name"
              className="setup-toolbar-naming-input"
              value={projectName}
              maxLength={80}
              onChange={(event) => {
                setProjectName(event.target.value);
              }}
            />
          </div>
        </div>

        <div className="setup-toolbar-actions">
          <span className="setup-toolbar-draft-pill">{changedCount} draft</span>
          <a className="setup-editor-link" href="/">
            Xem thiep local
          </a>
          <a className="setup-editor-link" href="/setup/rsvp?slug=thiep-cuoi-42-clone">
            Kiem tra RSVP
          </a>
          <button
            type="button"
            className="setup-editor-ghost"
            onClick={() => {
              void loadEditorItems();
            }}
          >
            Tai lai du lieu
          </button>
        </div>
      </header>

      <section className="setup-editor-layout">
        <aside className="setup-editor-toolrail">
          <button
            type="button"
            className={
              activeTab === 'text'
                ? 'setup-editor-toolrail-button active'
                : 'setup-editor-toolrail-button'
            }
            onClick={() => {
              handleTabChange('text');
            }}
          >
            <span className="setup-editor-toolrail-icon">Aa</span>
            <span className="setup-editor-toolrail-label">Text</span>
            <span className="setup-editor-toolrail-count">{textCount}</span>
          </button>

          <button
            type="button"
            className={
              activeTab === 'image'
                ? 'setup-editor-toolrail-button active'
                : 'setup-editor-toolrail-button'
            }
            onClick={() => {
              handleTabChange('image');
            }}
          >
            <span className="setup-editor-toolrail-icon">Img</span>
            <span className="setup-editor-toolrail-label">Image</span>
            <span className="setup-editor-toolrail-count">{imageCount}</span>
          </button>

          <label className="setup-editor-toolrail-toggle">
            <input
              type="checkbox"
              checked={strict}
              onChange={(event) => {
                setStrict(event.target.checked);
              }}
            />
            <span>Strict apply</span>
          </label>

          <button
            type="button"
            className="setup-editor-toolrail-utility"
            onClick={() => {
              setPreviewNonce(Date.now());
            }}
          >
            Reload canvas
          </button>
        </aside>

        <aside className="setup-editor-sidebar">
          <div className="setup-editor-panel-head">
            <h2>Layers</h2>
            <p>Chon item tu list hoac click tren canvas</p>
          </div>

          <input
            className="setup-editor-search"
            placeholder="Tim theo text, node id, duong dan"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
            }}
          />

          <div className="setup-editor-list">
            {isLoading ? <p className="setup-editor-note">Dang tai danh sach item...</p> : null}

            {!isLoading && !filteredItems.length ? (
              <p className="setup-editor-note">Khong tim thay item phu hop bo loc.</p>
            ) : null}

            {filteredItems.map((item) => {
              const isSelected = item.id === selectedItemId;
              const isChanged =
                typeof draftValues[item.id] === 'string' && draftValues[item.id] !== item.value;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={
                    isSelected
                      ? 'setup-editor-list-item selected'
                      : 'setup-editor-list-item'
                  }
                  onClick={() => {
                    selectItem(item.id, true);
                  }}
                >
                  <span className="setup-editor-list-label">{item.label}</span>
                  <span className="setup-editor-list-meta">
                    {item.nodeId ? `node ${item.nodeId}` : 'node none'}
                  </span>
                  {isChanged ? <span className="setup-editor-list-badge">Draft</span> : null}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="setup-editor-preview">
          <div className="setup-editor-preview-header">
            <div>
              <h2>Canvas</h2>
              <p>Click vao phan tu trong preview de chon nhanh</p>
            </div>

            <div className="setup-editor-preview-actions">
              <button
                type="button"
                className="setup-editor-ghost"
                onClick={() => {
                  setPreviewNonce(Date.now());
                }}
              >
                Reload file preview
              </button>
              <button
                type="button"
                className="setup-editor-ghost"
                onClick={() => {
                  void loadEditorItems();
                }}
              >
                Reload list item
              </button>
            </div>
          </div>

          <iframe
            ref={iframeRef}
            title="Template 42 Preview"
            src={previewUrl}
            className="setup-editor-preview-frame"
            onLoad={handlePreviewLoaded}
          />
        </section>

        <section className="setup-editor-inspector">
          <div className="setup-editor-inspector-head">
            <h2>Properties</h2>
            <p>{selectedItem ? selectedItem.label : 'Chua chon item'}</p>
          </div>

          {selectedItem ? (
            <div className="setup-editor-card">
              <p className="setup-editor-note">
                Loai: <strong>{selectedItem.type}</strong>
              </p>
              <p className="setup-editor-note">
                Node: <strong>{selectedItem.nodeId || 'none'}</strong>
              </p>

              <label className="setup-editor-field-label">Gia tri hien tai</label>
              <textarea
                className="setup-editor-textarea muted"
                value={selectedItem.value}
                readOnly
              />

              <label className="setup-editor-field-label">Gia tri moi</label>
              {selectedItem.type === 'text' ? (
                <>
                  {selectedItem.source === 'countdown-target' ? (
                    <p className="setup-editor-note">
                      Dinh dang de xuat: <strong>YYYY-MM-DDTHH:mm:ss+07:00</strong>
                    </p>
                  ) : null}
                  {selectedItem.source === 'qr-url' ? (
                    <p className="setup-editor-note">
                      Nhap URL day du, vi du: <strong>https://your-domain.com</strong>
                    </p>
                  ) : null}
                  {selectedItem.source === 'map-address' ||
                  selectedItem.source === 'iframe-src' ? (
                    <p className="setup-editor-note">
                      Ban co the nhap dia chi hoac link map, sau do bam <strong>Mo Google Maps</strong> de kiem tra nhanh.
                    </p>
                  ) : null}
                  <textarea
                    className="setup-editor-textarea"
                    value={selectedValue}
                    onChange={(event) => {
                      updateDraftValue(selectedItem, event.target.value);
                    }}
                  />
                  {selectedItem.source === 'map-address' ||
                  selectedItem.source === 'iframe-src' ? (
                    <div className="setup-editor-action-row compact">
                      <button
                        type="button"
                        className="setup-editor-ghost"
                        onClick={handleOpenSelectedMapOnGoogleMaps}
                      >
                        Mo Google Maps
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="setup-editor-image-box">
                  <input
                    className="setup-editor-input"
                    value={selectedValue}
                    onChange={(event) => {
                      updateDraftValue(selectedItem, event.target.value);
                    }}
                  />

                  <label className="setup-editor-upload">
                    {isUploading ? 'Dang upload...' : 'Upload anh moi'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        void handleUploadAsset(event.target.files?.[0]);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>

                  <div className="setup-editor-image-preview-grid">
                    <div>
                      <p>Anh goc</p>
                      <img src={selectedItem.value} alt="anh goc" />
                    </div>
                    <div>
                      <p>Anh dang sua</p>
                      <img src={selectedValue} alt="anh moi" />
                    </div>
                  </div>
                </div>
              )}

              <div className="setup-editor-action-row compact">
                <button
                  type="button"
                  className="setup-editor-ghost"
                  onClick={() => {
                    clearSelectedDraft();
                  }}
                >
                  Bo draft item nay
                </button>
              </div>
            </div>
          ) : (
            <p className="setup-editor-note">Chon mot item de bat dau chinh sua.</p>
          )}

          <div className="setup-editor-action-row">
            <button
              type="button"
              className="setup-editor-primary"
              disabled={isApplying || isResetting || isLoading}
              onClick={() => {
                void handleApplyChanges();
              }}
            >
              {isApplying ? 'Dang ap dung...' : `Luu thay doi (${changedCount})`}
            </button>
            <button
              type="button"
              className="setup-editor-secondary"
              disabled={isApplying || isResetting}
              onClick={() => {
                void handleResetTemplate();
              }}
            >
              {isResetting ? 'Dang khoi phuc...' : 'Reset ve backup'}
            </button>
          </div>

          {statusMessage ? <p className="setup-editor-success">{statusMessage}</p> : null}
          {errorMessage ? <p className="setup-editor-error">{errorMessage}</p> : null}

          {report.length > 0 ? (
            <div className="setup-editor-card">
              <h3>Report lan luu gan nhat</h3>
              <div className="setup-editor-report-list">
                {report.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="setup-editor-report-item">
                    <p>{item.label || item.id}</p>
                    <p>
                      source: {item.source}, count: {item.count}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

export default SetupPage;
