# Klivvr Scripts - Enhanced Version

A private internal tool for managing and browsing script entries stored in Google Sheets, with improved UI clarity, pinned rows management, and TypeScript integration.

## What's New

### 1. **UI Enhancement - Larger, Clearer Interface**
- Increased all interface element sizes by 15-20% for improved readability
- Larger font sizes: base 16px (was 14px), headings scaled proportionally
- Increased button padding and heights for better touch targets
- Enhanced spacing throughout for visual clarity
- Improved input field heights and textarea sizing
- Better visual hierarchy with adjusted component sizing

### 2. **Pinned Rows Feature**
- **Manual Pin/Unpin**: Click the pin icon on any row to pin/unpin it
- **Dedicated Pinned Section**: Pinned rows appear at the top in a visually distinct section
- **Persistent Storage**: Pinned row order is saved to Google Sheets (column E) and survives page reloads
- **Visual Feedback**: Pinned cards show a drag handle indicator (⋮⋮) on hover

### 3. **Drag-and-Drop Reordering**
- Reorder pinned rows by dragging them within the pinned section
- Native HTML5 drag-and-drop API (no external dependencies)
- Visual feedback during drag operations (opacity change, blue highlight)
- Automatically persists reordering to the backend
- Smooth animations and clear drop zones

### 4. **TypeScript Migration**
- Full TypeScript conversion for type safety and better IDE support
- Modular code structure with separated concerns:
  - `src/types.ts` - Shared type definitions
  - `src/api.ts` - API client with typed responses
  - `src/dom.ts` - DOM utility functions
  - `src/storage.ts` - Local storage utilities
  - `src/categories.ts` - Category definitions and utilities
  - `src/app.ts` - Main application logic
- Enhanced error handling and null-safety checks
- Build tooling with esbuild for fast compilation

## Installation & Setup

### Prerequisites
- Node.js 22.x or higher
- npm or yarn package manager
- Google Sheets API credentials (existing setup)

### Build & Development

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build
```

The TypeScript files in `src/` are compiled to JavaScript and output to `public/app.js`.

## Architecture

### Type System
All major data structures are strongly typed:
- `Row` - Individual row/entry structure
- `AppState` - Global application state
- `DataResponse` - API response formats
- `CategoryDef` - Category definitions with styles
- `PinOrderMetadata` - Pinned order persistence data

### API Layer
Typed API client (`src/api.ts`) handles:
- Session management (`/api/me`)
- Data fetching (`/api/data`)
- Row operations (add, update, delete)
- Pinned order persistence (`/api/pin-order`)

### State Management
Global state object `S` (AppState) manages:
- Rows data and metadata
- UI state (modal visibility, search, sorting)
- Pinned rows order and configuration
- User session and permissions

### Storage
Dual-layer persistence:
- **Local Storage**: Cache for offline access, UI preferences
- **Backend**: Persistent storage in Google Sheets, especially for pinned order

## Features

### Core Features
- Browse and search script entries
- Add, edit, and delete rows
- Color-coded categories (Available, General, Unavailable, Other)
- Hide sensitive content with one-click reveal
- Copy values to clipboard
- Collapsible category groups
- Responsive design (mobile-friendly)

### Pinned Rows
- Pin important rows to the top for quick access
- Drag to reorder pinned rows
- Pinned order saved to Google Sheets column E
- Visual distinction with gradient background and icon
- Automatically load pinned state on app startup

### UI Improvements
- 16px base font size (up from 14px)
- Larger buttons with improved touch targets (32px icons)
- Increased padding and spacing (+15-20%)
- Better visual feedback on interactions
- Improved form fields and modals

## Keyboard Shortcuts

- **Cmd/Ctrl + K** - Focus search input
- **Cmd/Ctrl + N** - Open "Add row" dialog
- **Escape** - Close any open modal or dialog

## Data Storage

### Local Storage Keys
- `ks_groups` - Expanded category groups
- `ks_data` - Cached rows data
- `ks_hide` - Content hide preference
- `ks_pinned_order` - Local pinned rows order

### Backend Storage
- Pinned order stored in Google Sheets column E, row 1
- Format: JSON array of row identifiers
- Automatically synced with UI state

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Fast TypeScript compilation with esbuild
- No external UI framework dependencies
- Lightweight bundle with native APIs
- Efficient DOM updates with animation delays
- Debounced search (150ms)

## Development Guidelines

### Code Style
- TypeScript strict mode enabled
- ESLint recommended (configure if needed)
- Use semantic HTML and CSS custom properties
- Follow existing patterns for consistency

### Adding New Features
1. Define types in `src/types.ts`
2. Add API methods in `src/api.ts`
3. Implement UI in `src/app.ts`
4. Update styles in `public/style.css`
5. Add storage handlers in `src/storage.ts` if needed

### Testing
- Manual testing in preview environment
- Check all UI interactions (pin/unpin, drag-drop)
- Verify persistence across page reloads
- Test on mobile devices

## Troubleshooting

### Pinned rows not persisting
1. Check browser console for errors
2. Verify `/api/pin-order` endpoint is accessible
3. Clear browser cache and reload
4. Check Google Sheets permissions

### UI scaling issues
1. Clear browser cache
2. Reload page (Cmd/Ctrl + Shift + R)
3. Check CSS custom properties in `public/style.css`

### TypeScript compilation errors
1. Verify all types are imported correctly
2. Run `npm run build` to check for errors
3. Check `tsconfig.json` settings

## Contributing

When making changes:
1. Maintain TypeScript strict mode compliance
2. Update types when data structures change
3. Keep modular structure with separated concerns
4. Test UI changes on mobile devices
5. Update this README if adding major features

## License

Private - For authorized users only
