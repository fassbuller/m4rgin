// Linien-Icons wie in Fountain (Lucide, Strichstärke 2). Die Namen bleiben die bisherigen
// MaterialCommunityIcons-Namen, damit kein Aufrufer umgeschrieben werden muss; was hier nicht
// zugeordnet ist, fällt auf das alte Icon zurück.
import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Activity, AlertTriangle, ArrowUpDown, ChevronDown, Ellipsis, Archive, ArchiveRestore, ArrowRight, Barcode, BookCheck, BookCopy, BookOpen, BookOpenText,
  BookX, Bot, Calculator, Calendar, Camera, CameraOff, ChartLine, ChartSpline, Check, CheckCheck, ChevronRight,
  Circle, CircleCheck, CircleDot, CirclePause, CircleX, Coins, ExternalLink, FilterX, Flag, FlashlightOff, Gem, Hand,
  History, Info, Library, Link, LucideIcon, Minus, Pause, PenLine, Pencil, Plus, RefreshCw, RotateCcw, Save, ScanBarcode,
  ScanText, Search, SearchX, Settings, Share2, ShoppingBasket, Sparkles, Stethoscope, Store, Tag, Target, Trash2,
  TrendingDown, TrendingUp, MoveRight, UserPen, X, Zap, BookImage,
} from 'lucide-react-native';
import { F } from '../theme';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const LUCIDE: Partial<Record<IconName, LucideIcon>> = {
  'account-edit': UserPen,
  alert: AlertTriangle,
  'archive-arrow-down': Archive,
  'archive-off-outline': ArchiveRestore,
  'arrow-right': ArrowRight,
  barcode: Barcode,
  'barcode-scan': ScanBarcode,
  basket: ShoppingBasket,
  'book-check': BookCheck,
  'book-multiple': BookCopy,
  'book-open-blank-variant': BookImage,
  'book-open-page-variant': BookOpenText,
  'book-open-variant': BookOpen,
  'book-remove': BookX,
  bookshelf: Library,
  'calculator-variant': Calculator,
  calendar: Calendar,
  camera: Camera,
  'camera-off': CameraOff,
  cash: Coins,
  'chart-bell-curve': ChartSpline,
  'chart-line': ChartLine,
  'chart-timeline-variant': Activity,
  check: Check,
  'check-all': CheckCheck,
  'check-circle': CircleCheck,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'dots-horizontal': Ellipsis,
  'sort': ArrowUpDown,
  close: X,
  'close-circle': CircleX,
  cog: Settings,
  'content-save': Save,
  'diamond-stone': Gem,
  'draw-pen': PenLine,
  'filter-remove': FilterX,
  flag: Flag,
  'flashlight-off': FlashlightOff,
  'gesture-tap': Hand,
  history: History,
  information: Info,
  'lightning-bolt': Zap,
  'link-variant': Link,
  magnify: Search,
  minus: Minus,
  'numeric-1-circle': CircleDot,
  'open-in-new': ExternalLink,
  pause: Pause,
  'pause-circle': CirclePause,
  pencil: Pencil,
  plus: Plus,
  'radiobox-blank': Circle,
  'radiobox-marked': CircleDot,
  'record-circle': CircleDot,
  refresh: RefreshCw,
  restore: RotateCcw,
  robot: Bot,
  'share-variant': Share2,
  'star-four-points': Sparkles,
  'star-half-full': Sparkles,
  stethoscope: Stethoscope,
  store: Store,
  'store-off': SearchX,
  'store-search': Store,
  tag: Tag,
  target: Target,
  'text-recognition': ScanText,
  'trash-can-outline': Trash2,
  'trending-down': TrendingDown,
  'trending-neutral': MoveRight,
  'trending-up': TrendingUp,
};

export function Icon({ name, size = 20, farbe = F.tinte }: { name: IconName; size?: number; farbe?: string }) {
  const L = LUCIDE[name];
  if (L) return <L size={size} color={farbe} strokeWidth={2} />;
  return <MaterialCommunityIcons name={name} size={size} color={farbe} />;
}
