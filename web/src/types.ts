export type Attendance = 'yes' | 'no';

export interface CouplePerson {
  role: string;
  name: string;
  quote: string;
  photo: string;
}

export interface StoryBlock {
  title: string;
  date: string;
  text: string;
}

export interface EventBlock {
  title: string;
  timeLabel: string;
  lunarDate: string;
  venue: string;
  address: string;
  mapUrl: string;
}

export interface GalleryItem {
  src: string;
  alt: string;
}

export interface InvitationStats {
  rsvpCount: number;
  attendingGuests: number;
  wishCount: number;
  heartCount: number;
}

export interface InvitationPayload {
  slug: string;
  title: string;
  subtitle: string;
  heroQuote: string;
  dateLabel: string;
  countdownTarget: string;
  locationSummary: string;
  audioUrl: string;
  palette: {
    bg: string;
    accent: string;
    text: string;
    card: string;
  };
  couple: {
    groom: CouplePerson;
    bride: CouplePerson;
  };
  story: StoryBlock[];
  events: EventBlock[];
  gallery: GalleryItem[];
  mapEmbedUrl: string;
  stats: InvitationStats;
}

export interface WishItem {
  id: number;
  senderName: string;
  message: string;
  createdAt: string;
}

export interface RsvpInput {
  slug: string;
  guestName: string;
  attendance: Attendance;
  guestCount: number;
  note?: string;
}

export interface WishInput {
  slug: string;
  senderName: string;
  message: string;
}

export interface GiftInput {
  slug: string;
  senderName?: string;
  giftType: 'heart-shot' | 'lucky-money' | 'flower-bouquet';
  amount: number;
  message?: string;
}
