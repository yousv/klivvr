# Quick Start Guide

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Project
```bash
# Production build (TypeScript → JavaScript)
npm run build

# Or development build with watch mode
npm run dev
```

### 3. Run the Application
The app is already hosted and accessible at your Vercel deployment URL.

## New Features Overview

### Pinned Rows
- **Pin a Row**: Click the pin icon (top-right of any row) to pin it
- **View Pinned Section**: Pinned rows appear at the very top under "Pinned Rows"
- **Reorder Pinned**: Drag pinned rows to change their order
- **Unpin**: Click the pin icon again to unpin

### Larger UI
- All interface elements are 15-20% larger
- Font sizes increased for better readability
- Buttons and inputs have larger touch targets
- Better spacing throughout the app

### Keyboard Shortcuts
- **Cmd/Ctrl + K** - Focus search
- **Cmd/Ctrl + N** - Add new row
- **Escape** - Close modal

## What Changed

### TypeScript
- Entire codebase converted to TypeScript (strict mode)
- Better type safety and IDE support
- Modular structure with separate utilities

### Database
- New column E in Google Sheets stores pinned row order
- Automatically synced - no manual setup needed

### UI/UX
- Larger fonts and buttons for accessibility
- Pinned section with drag-and-drop reordering
- Better visual feedback during interactions

## File Structure

```
src/                    # TypeScript source files
├── app.ts             # Main application logic
├── api.ts             # API client functions
├── types.ts           # Type definitions
├── dom.ts             # DOM utilities
├── storage.ts         # Storage utilities
└── categories.ts      # Category definitions

public/               # Frontend assets
├── index.html         # Main HTML
├── style.css          # Enhanced styles
└── app.js             # Compiled JavaScript

api/                  # Backend handlers
├── data.js           # Get sheet data
├── rows.js           # CRUD operations
└── pin-order.js      # Pinned order management
```

## Common Tasks

### Adding a Row
1. Click "Add" button in top-right
2. Select category
3. Fill in fields
4. Click "Save"

### Pinning a Row
1. Hover over any row
2. Click the pin icon
3. Row moves to "Pinned Rows" section at top

### Reordering Pinned Rows
1. Click and hold a pinned row
2. Drag it to new position
3. Release to drop (automatically saves)

### Searching
1. Click search box or press Cmd/Ctrl+K
2. Type to filter rows
3. Categories auto-expand with matches

## Troubleshooting

### Build Fails
- Check Node.js version: `node --version` (need 22.x)
- Clear node_modules: `rm -rf node_modules && npm install`
- Check console for TypeScript errors

### UI Not Showing Changes
- Hard refresh browser: Cmd/Ctrl+Shift+R
- Clear browser cache
- Check browser console for errors

### Pinned Order Not Saving
- Check browser console for API errors
- Verify Google Sheets permissions
- Check network tab in DevTools

## Next Steps

1. **Run Development Build**: `npm run dev` for auto-reload while editing
2. **Make Changes**: Edit `src/app.ts` or CSS as needed
3. **Rebuild**: Run `npm run build` when done
4. **Deploy**: Use Vercel deployment (automatic on git push)

## Support

- Check `README.md` for full documentation
- See `IMPLEMENTATION.md` for technical details
- Review `src/app.ts` comments for code understanding

## Keyboard Tips

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + K | Search |
| Cmd/Ctrl + N | Add row |
| Escape | Close modal |
| Click copy icon | Copy cell value |
| Click pin icon | Pin/unpin row |
| Drag pinned row | Reorder |

## Performance Notes

- App loads cached data instantly
- Search is debounced (150ms)
- Drag-and-drop uses native APIs (fast)
- No heavy dependencies (vanilla + TypeScript)

## Browser Requirements

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS/Android)

---

**Ready to start?** Run `npm run dev` and open the app in your browser!
