# TaskerOnchain Design Guidelines

## Design Approach

**Reference-Based**: Drawing from Yellow.com's dark aesthetic and LINE NEXT's minimalist sophistication. This combines DeFi credibility with enterprise-grade polish.

**Key Principles**:
- Extreme minimalism with strategic yellow accents
- Bold typography hierarchy for clarity
- Card-based information architecture
- Generous whitespace for breathing room
- Subtle depth through shadows, not gradients

---

## Core Design Elements

### Typography

**Font Stack**: Inter for UI, Space Grotesk for headings (via Google Fonts CDN)

**Hierarchy**:
- Hero Headlines: 56px/64px, font-weight 700, tracking -0.02em
- Section Headers: 36px/44px, font-weight 700
- Card Titles: 20px/28px, font-weight 600
- Body Text: 16px/24px, font-weight 400
- Small Text/Labels: 14px/20px, font-weight 500
- Captions: 12px/16px, font-weight 400

**Treatment**: All-caps for labels, sentence case for content, left-aligned throughout

### Layout System

**Spacing Primitives**: Use Tailwind units of 4, 6, 8, 12, 16, 24 (p-4, gap-6, mt-8, etc.)

**Grid Structure**:
- Max-width container: `max-w-7xl mx-auto px-6`
- Card grids: 3-column on desktop (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- Dashboard layouts: 2-column split (60/40 for main/sidebar)
- Section vertical spacing: `py-16 md:py-24`

### Color Palette

**Backgrounds**:
- Primary: `#0a0a0a` (deep black)
- Card: `#1a1a1a` (elevated black)
- Input/Hover: `#2a2a2a`
- Border: `#333333`

**Accents**:
- Yellow Primary: `#FFD700` (gold yellow)
- Yellow Hover: `#FFC300`
- Success: `#10b981`
- Error: `#ef4444`
- Warning: `#f59e0b`

**Text**:
- Primary: `#ffffff`
- Secondary: `#a3a3a3`
- Tertiary: `#737373`

### Component Library

**Cards**:
- Background: `#1a1a1a`
- Border: `1px solid #333333`
- Border radius: `12px`
- Shadow: `0 4px 24px rgba(0, 0, 0, 0.4)`
- Padding: `p-6` or `p-8` for larger cards
- Hover: subtle border color shift to yellow

**Buttons**:
- Primary: Yellow background (#FFD700), black text, 12px radius, 14px height (h-14), font-weight 600
- Secondary: Transparent with yellow border, yellow text
- Ghost: No border, yellow text with hover background (#2a2a2a)
- Disabled: Opacity 40%

**Forms**:
- Input background: `#2a2a2a`
- Border: `1px solid #333333`
- Focus border: Yellow (#FFD700)
- Height: `h-12` for inputs
- Border radius: `8px`
- Label above input, 12px font-size, secondary text color

**Tables**:
- Header background: `#1a1a1a`
- Row border: `1px solid #333333`
- Hover row: `#2a2a2a`
- Striped rows: alternate between card and primary background
- Cell padding: `py-4 px-6`

**Navigation**:
- Top navbar: Fixed, background `#0a0a0a/95` with backdrop blur
- Height: `h-20`
- Logo left, wallet connection right
- Navigation links center (Desktop) or hamburger menu (Mobile)

---

## Page Structures

### Landing/Hero Section
- Full viewport height (`min-h-screen`) with centered content
- Hero headline explaining "Automate DeFi Tasks Onchain"
- Subheadline explaining executor marketplace
- Two CTAs: "Create Task" (primary yellow) + "Become Executor" (secondary)
- Background: Dark with subtle grid pattern overlay
- Statistics bar below hero: TVL, Total Tasks, Executors (4-column grid)

### Task Creator Wizard (Multi-step)
**Step Navigation**: Horizontal stepper at top showing 4 steps
1. Choose Template (grid of template cards with icons)
2. Configure Parameters (form with live preview card on right)
3. Review & Approve (summary card with transaction breakdown)
4. Task Created (success state with task ID and dashboard link)

**Layout**: 2-column split - left for inputs, right for live preview card

### Task Dashboard
- Tab navigation: "Active", "Completed", "Cancelled"
- Task cards in grid layout (2-3 columns)
- Each card shows: Task type, status badge, executions count, reward, expiry
- Filter/sort bar above grid
- Empty state with illustration when no tasks

### Executor Dashboard
**Top Section**: Executor stats cards (4-column grid)
- Reputation score with progress bar
- Total earned
- Successful executions
- Staked amount

**Task Browser**: 
- Available tasks table with columns: Task Type, Reward, Gas Cost, Profit, Action button
- Filters sidebar (left): Status, Min Profit, Task Type
- Profitability calculation displayed per row

### Leaderboard
- Yellow.com inspired layout
- Top 3 highlighted with larger cards and badges
- Table for positions 4-50
- User's rank card pinned at top (if in top 100)
- Columns: Rank, Address (truncated), Total Earned, Reputation, Executions

### Analytics Dashboard
**Layout**: 3-row structure
- Row 1: 4 metric cards (TVL, Total Tasks, Executors, Volume)
- Row 2: 2 charts side-by-side (Executions over time, Task types distribution)
- Row 3: Recent activity table

---

## Images

**Hero Section**: Abstract 3D illustration of interconnected nodes/blocks representing automation. Dark background with subtle yellow highlights on key nodes. Positioned as full-width background with dark overlay for text legibility.

**Template Cards**: Icon-based illustrations for each task type (limit order = chart arrow, DCA = recurring circle arrows, auto-compound = growth plant). Use line-style icons in yellow on dark card backgrounds.

**Empty States**: Minimalist line illustrations for "No tasks yet", "No executions", etc. Yellow stroke on transparent background.

**Executor Dashboard**: Small avatar placeholders for top executors in leaderboard using generated geometric patterns.

---

## Responsive Behavior

- Desktop (lg:): 3-column grids, full sidebar visibility
- Tablet (md:): 2-column grids, collapsible sidebar
- Mobile: Single column, bottom navigation bar, hamburger menu for main nav

## Animations

Use sparingly:
- Card hover: Subtle scale (1.02) and shadow increase
- Button hover: Background color transition (150ms)
- Page transitions: Fade in content (300ms)
- Number counters: Animate from 0 on view (stats)