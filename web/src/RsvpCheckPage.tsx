import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  fetchRsvpSubmissions,
  type RsvpSubmissionItem,
} from './templateSetupApi';

type AttendanceFilter = 'all' | 'yes' | 'no';

const DEFAULT_SLUG = 'thiep-cuoi-42-clone';

function readInitialSlug() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug')?.trim() ?? '';
  return slug || DEFAULT_SLUG;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function getAttendanceLabel(attendance: 'yes' | 'no') {
  return attendance === 'yes' ? 'Se tham du' : 'Khong tham du';
}

function getAttendanceClass(attendance: 'yes' | 'no') {
  return attendance === 'yes' ? 'yes' : 'no';
}

function escapeCsvCell(value: string | number) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(items: RsvpSubmissionItem[]) {
  const header = [
    'ID',
    'Nguoi xac nhan',
    'Trang thai',
    'So nguoi',
    'Ghi chu',
    'Thoi gian',
  ];

  const rows = items.map((item) => [
    item.id,
    item.guestName,
    getAttendanceLabel(item.attendance),
    item.guestCount,
    item.note || '',
    formatDateTime(item.createdAt),
  ]);

  const allRows = [header, ...rows]
    .map((cells) => cells.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n');

  return allRows;
}

function downloadCsv(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function RsvpCheckPage() {
  const [slugInput, setSlugInput] = useState(() => readInitialSlug());
  const [activeSlug, setActiveSlug] = useState(() => readInitialSlug());
  const [reloadCounter, setReloadCounter] = useState(0);
  const [items, setItems] = useState<RsvpSubmissionItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadRsvps() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const result = await fetchRsvpSubmissions({
          slug: activeSlug,
          limit: 500,
        });

        if (cancelled) {
          return;
        }

        setItems(result.items);
        setLastLoadedAt(new Date().toISOString());
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Khong tai duoc danh sach RSVP.';
        setErrorMessage(message);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadRsvps();

    return () => {
      cancelled = true;
    };
  }, [activeSlug, reloadCounter]);

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return items.filter((item) => {
      if (attendanceFilter !== 'all' && item.attendance !== attendanceFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const target = `${item.guestName} ${item.note}`.toLowerCase();
      return target.includes(keyword);
    });
  }, [attendanceFilter, items, searchText]);

  const stats = useMemo(() => {
    const attendingResponses = items.filter((item) => item.attendance === 'yes').length;
    const declinedResponses = items.filter((item) => item.attendance === 'no').length;
    const attendingGuests = items
      .filter((item) => item.attendance === 'yes')
      .reduce((sum, item) => sum + item.guestCount, 0);

    return {
      totalResponses: items.length,
      attendingResponses,
      declinedResponses,
      attendingGuests,
    };
  }, [items]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextSlug = slugInput.trim();
    if (!nextSlug) {
      setErrorMessage('Vui long nhap slug cua thiep.');
      return;
    }

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('slug', nextSlug);
    window.history.replaceState({}, '', currentUrl.toString());

    if (nextSlug === activeSlug) {
      setReloadCounter((value) => value + 1);
      return;
    }

    setActiveSlug(nextSlug);
  }

  function handleExportCsv() {
    if (!filteredItems.length) {
      return;
    }

    const csv = buildCsv(filteredItems);
    const fileName = `rsvp-${activeSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(fileName, csv);
  }

  return (
    <main className="rsvp-check-shell">
      <header className="rsvp-check-header">
        <div>
          <h1>Theo doi xac nhan tham du</h1>
          <p>Xem ai da gui form RSVP, trang thai va so nguoi di cung.</p>
        </div>

        <div className="rsvp-check-header-actions">
          <a className="rsvp-check-link" href="/">
            Ve trang preview
          </a>
          <a className="rsvp-check-link" href="/setup">
            Mo setup
          </a>
        </div>
      </header>

      <section className="rsvp-check-panel">
        <form className="rsvp-check-form" onSubmit={handleSubmit}>
          <label htmlFor="rsvp-slug">Slug thiep</label>
          <input
            id="rsvp-slug"
            value={slugInput}
            onChange={(event) => {
              setSlugInput(event.target.value);
            }}
            placeholder="thiep-cuoi-42-clone"
          />
          <button type="submit">Tai danh sach</button>
          <button
            type="button"
            onClick={() => {
              setReloadCounter((value) => value + 1);
            }}
          >
            Tai lai
          </button>
        </form>

        <div className="rsvp-check-toolbar">
          <input
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
            }}
            placeholder="Tim theo ten hoac ghi chu"
          />

          <select
            value={attendanceFilter}
            onChange={(event) => {
              setAttendanceFilter(event.target.value as AttendanceFilter);
            }}
          >
            <option value="all">Tat ca trang thai</option>
            <option value="yes">Se tham du</option>
            <option value="no">Khong tham du</option>
          </select>

          <button type="button" onClick={handleExportCsv} disabled={!filteredItems.length}>
            Xuat CSV
          </button>
        </div>

        <div className="rsvp-check-stats">
          <article>
            <p>Tong phan hoi</p>
            <strong>{stats.totalResponses}</strong>
          </article>
          <article>
            <p>Se tham du</p>
            <strong>{stats.attendingResponses}</strong>
          </article>
          <article>
            <p>Khong tham du</p>
            <strong>{stats.declinedResponses}</strong>
          </article>
          <article>
            <p>Tong khach tham du</p>
            <strong>{stats.attendingGuests}</strong>
          </article>
        </div>

        {lastLoadedAt ? (
          <p className="rsvp-check-meta">Cap nhat luc: {formatDateTime(lastLoadedAt)}</p>
        ) : null}

        {errorMessage ? <p className="rsvp-check-error">{errorMessage}</p> : null}

        <div className="rsvp-check-table-wrap">
          {isLoading ? <p className="rsvp-check-note">Dang tai du lieu RSVP...</p> : null}

          {!isLoading && !filteredItems.length ? (
            <p className="rsvp-check-note">Chua co du lieu RSVP phu hop bo loc.</p>
          ) : null}

          {!isLoading && filteredItems.length ? (
            <table className="rsvp-check-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nguoi xac nhan</th>
                  <th>Trang thai</th>
                  <th>So nguoi</th>
                  <th>Ghi chu</th>
                  <th>Thoi gian</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.guestName}</td>
                    <td>
                      <span className={`rsvp-check-badge ${getAttendanceClass(item.attendance)}`}>
                        {getAttendanceLabel(item.attendance)}
                      </span>
                    </td>
                    <td>{item.guestCount}</td>
                    <td>{item.note || '-'}</td>
                    <td>{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default RsvpCheckPage;
