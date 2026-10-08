---
title: "Getting around Cord: menu, search, shortcuts and notifications"
description: "Where each section lives, how to search with ⌘K, create from any screen, pin pages, switch the theme, read notifications and use Cord on your phone."
category: "Account & Team"
order: 2
---

Cord has two fixed areas that stay with you on every screen: the **sidebar** on the left, with your business's sections, and the **top bar**, with search and quick actions. This guide walks through both, the keyboard shortcuts, and how everything looks on your phone.

## The sidebar

### At the top: your workspace

At the top sits the workspace switcher: the square with your organization's initial or logo, the word **Workspace** and its name. When you open it you can:

- Switch to another organization you belong to.
- **Create workspace** (for example, another legal entity or another country). See [Managing multiple workspaces](/en/support/multiples-empresas).
- Go to **Team settings**.
- Enter or leave the **Test environment**. See [Testing Cord without affecting production](/en/support/sandbox-pruebas).
- **Sign out**.

### The sections

Below the switcher, the sections are laid out like this. The ones you use every day come first, with no heading; the rest are grouped into three blocks you can collapse.

| Group | Section | What you'll find | Shortcut |
| --- | --- | --- | --- |
| (no heading) | **Home** | Your business at a glance and recent activity | `G` `D` |
| | **Quotes** | All your quotes and how they're moving | `G` `C` |
| | **Clients** | Your client directory | `G` `L` |
| | **Products** | Your catalog | `G` `P` |
| | **Tasks** | Your team's to-dos | `G` `T` |
| **Revenue** | **Invoices** | Issued and outstanding invoices | `G` `F` |
| | **Payments** | Payments received, payouts, refunds and disputes | `G` `O` |
| | **Collections** | Accounts receivable and overdue balances | `G` `B` |
| | ↳ **AI agent** | The agent that drafts and negotiates collections for you | — |
| **Insights** | **Reports** | Overview, finance, cash flow, collections, clients and products | `G` `A` |
| | **Performance** | How each person on the team closes and collects | `G` `E` |
| **Automation** | **Workflows** | Rules that react to what happens in Cord | `G` `W` |

- **AI agent** shows up indented under **Collections** only while you're on Collections or on the agent itself. See [Automatic AI collections](/en/support/cobranza-automatica).
- **Settings is not in the sidebar.** It opens with the gear in the top bar (on a phone, with **Settings** inside the menu). That's also where your team members live, under **Settings › Team & permissions**: the **Performance** section in the sidebar is something else, each person's sales performance.
- Every section shows in the sidebar; if your role doesn't have permission for one, Cord tells you so when you open it and who to ask.

### Counters

Some sections carry a number on the right so you know where something needs attention:

- **Quotes:** the ones your client already opened and hasn't approved or rejected yet. A good moment to follow up.
- **Tasks:** yours or unassigned ones that are due today or overdue. The counter is gray and turns orange when any of them is already overdue.
- **Collections:** overdue accounts, from quotes and invoices together, in orange.

Hover over a counter to see what it's counting. When there's nothing pending, the number disappears.

### Collapsible groups

Click a group's name (**Revenue**, **Insights**, **Automation**) to collapse or expand it. Cord remembers which groups you left collapsed and shows them the same way on any computer or browser. If you open a page that belongs to a collapsed group, that group opens on its own so you can see where you are.

### Pinning pages

You can pin the pages you open often to the sidebar: a key client, a specific report, an invoice you're chasing.

1. Open the page and click the pin button next to its title, or press the `X` key.
2. The page shows up at the top of the sidebar, under **Pinned**, with its section's icon (a pinned client gets the Clients icon).
3. To reorder them, drag them. To remove one, hover over it and click the **X**, or press `X` again while you're on that page.

You can have up to 12 pinned pages. They're saved to your account, per person and per workspace: they follow you to another computer or browser, and each organization keeps its own. If you have none, the **Pinned** section doesn't show.

### Sidebar footer

- **Active quotes** (for example `4 / 5`): only shows on plans that cap active quotes. The bar turns amber at 80% and red when you hit the limit; **Upgrade plan** takes you to your subscription. See [Your Cord subscription](/en/support/planes-suscripcion).
- **Invite people**: opens the invitation for a new member directly. It shows up if you have the Team permission and your plan includes more than one user. See [Inviting members and roles](/en/support/invitar-miembros-roles).
- **Button to collapse the sidebar**, on the right (shortcut `[`).

### Collapsed sidebar

If you want more room, collapse the sidebar with the footer button or the `[` key. It becomes a narrow column with icons only:

- Counters turn into a dot: gray, or red when something is overdue.
- Hover over an icon to see its name, its counter and its shortcut.
- Press `[` or the button again to expand it. Cord remembers your choice in that browser.

### Moving between pages

In recent versions of Chrome, Edge and Safari, the sidebar stays still and only the content changes, with a smooth transition. Sidebar sections start loading as soon as you hover over them, so they open faster, and the sidebar keeps its scroll position between pages.

## The top bar

From left to right:

1. **Search** ("Search…"): opens the command menu. Its shortcut is `⌘ K` on Mac and `Ctrl K` on Windows and Linux, or `/`.
2. **Setup guide**: a ring with how far along your initial setup is. It only shows while you haven't finished it and you've minimized it; click it to pick it back up.
3. **Create**: the dark button with a `+`. Its menu starts a **Quote** (`C`), an **Invoice** (`F`), a **Client** (`L`), a **Product** (`P`) or a **Task** (`T`) from any screen. Each option only shows if your role has the matching permission, and its key only works if the option is there. The letters are the same ones `G` uses to go to that section.
4. **Apps**: shows the integrations you've already connected, with their logos, and takes you to **Explore integrations**. It shows up if you have the Settings permission.
5. **Notifications** (the bell), with a counter of new updates. See below.
6. **Help**: opens the Help panel.
7. **Theme**: its icon shows the current mode. See below.
8. **Settings** (the gear): takes you to all of your account's configuration. It stays highlighted while you're in Settings.

The **Create**, **Notifications** and **Apps** menus open one at a time. **Create** and **Apps** also work with the keyboard: `Enter`, `Space` or the down arrow enter the menu, the arrows, `Home` and `End` move through it, and `Esc` closes it and takes you back to the button.

## Search with ⌘K

Open search with `⌘ K` (Mac), `Ctrl K` (Windows and Linux), `/`, or by clicking **Search…**.

- **Before you type** you see your **Recent** items (the last things you opened from search), **Go to** with every section and its shortcut on the right, and **Actions**: **Build with AI** (opens a new quote), **New invoice**, **New client**, **New product**, **New task** and **View public site**.
- **Once you type two letters or more** it searches your quotes (by number or client), your invoices (by number or client, if you have the Collections permission), your clients (by name or tax ID) and your products (by name or SKU). Quotes and invoices show their status and amount in their own currency, for example "Viewed · US$1,200.00" or "Open · $3,480.00". Clients and products open their record directly.
- **Settings tabs are searchable too**, even by synonyms: type "VAT", "tax ID", "taxes" or "domain" and you land on the right tab.
- Move with the `↑` `↓` arrows, open with `Enter` and close with `Esc`, which takes you back to where you were.

An invoice's statuses in search are **Draft**, **Open**, **Paid**, **Void** and **Uncollectible**.

## Notifications (the bell)

The bell only tells you what **your client** did or what **money came in**, for both quotes and invoices:

- Viewed the quote or viewed the invoice.
- Approved or rejected.
- Made a counteroffer.
- Sent you a message.
- Made a partial payment, paid, or the invoice was paid.

Your own actions —sending, editing a draft, creating a version, automatic reminders— don't show up, so the bell doesn't fill up with noise.

- The counter shows how many updates you haven't seen, 1 to 9, then "9+".
- When you open the bell you see the 15 most recent; new ones are highlighted and each one opens its quote or invoice.
- Opening it marks them as seen. **Mark as read** marks all of them as read.
- **View all activity** takes you to the full history on **Home**.
- What you've read is saved to your account: what you saw on your phone doesn't show up as new on your computer. Each team member has their own read state.

Email, Slack or Teams alerts are configured separately, under **Settings › Notifications**. See [Notifications: bell, email, Slack and Teams](/en/support/notificaciones).

## Help

The **Help** button in the top bar opens a panel with:

- A search box that finds answers in the frequently asked questions and in the articles of this Help Center.
- **Keyboard shortcuts** (on a computer), **User guide** and **Contact support**.
- **Cord AI**, an assistant that instantly answers how to do something in Cord, based on this Help Center. It can't see your account's data or make changes to it.

## Light, dark or system theme

The theme button shows the current mode: a **sun** for Light, a **moon** for Dark and a **monitor** for System. Each click moves to the next one: Light → Dark → System → Light.

- **System** follows your computer's or phone's setting live: if your device switches to dark mode at night, Cord switches with it.
- The starting mode is **Light**.
- Your choice is remembered in that browser; on another device you can pick a different one.

## Keyboard shortcuts

They work on a computer, on any screen of the app. Press `?` to see the full list on screen.

| Key | What it does |
| --- | --- |
| `⌘ K` / `Ctrl K`, or `/` | Opens search and the command menu |
| `C` | Creates a quote |
| `F` | Creates an invoice |
| `L` | Creates a client |
| `P` | Creates a product |
| `T` | Creates a task |
| `G` then `D` | Go to Home |
| `G` then `C` | Go to Quotes |
| `G` then `L` | Go to Clients |
| `G` then `P` | Go to Products |
| `G` then `T` | Go to Tasks |
| `G` then `F` | Go to Invoices |
| `G` then `O` | Go to Payments |
| `G` then `B` | Go to Collections |
| `G` then `A` | Go to Reports |
| `G` then `E` | Go to Performance |
| `G` then `W` | Go to Workflows |
| `[` | Collapses or expands the sidebar |
| `X` | Pins the current page to the sidebar, or unpins it |
| `?` | Shows the shortcuts |
| `Esc` | Closes the open menu or dialog |

- For the `G` shortcuts, press `G`, release it and press the second letter.
- If you rest the cursor for half a second on a sidebar section, its shortcut appears on the right (when it has no counter).
- Shortcuts don't fire while you're typing in a text field.
- Create shortcuts respect your permissions: if you can't create invoices, `F` does nothing.
- The quote and invoice editor has its own shortcuts to save and send. See [Create a quote or an invoice step by step](/en/support/crear-cotizacion-o-factura).

## On your phone

On narrow screens, Cord adapts to touch:

- **The sidebar becomes a panel** that you open with the three-line button on the left of the top bar and close by tapping outside it.
- At the top of the panel there are three large rows: **Help**, **Theme** (shows Light, Dark or System and changes with each tap) and **Settings**.
- Below are your **Pinned** pages (the **X** to remove them is always visible) and every section, with taller rows for your finger and a single scroll. To pin new pages, use a computer.
- In the top bar, search shrinks to a **magnifying glass**, **Create** is a circle with a `+`, and the **Setup guide** shows just its ring. The gear, help and theme move into the menu panel.
- There's no collapsed sidebar, no keyboard shortcuts and no hover tooltips: everything is done by tapping.

## Frequently asked questions

**Where did Settings go?** It's the gear in the top bar. On a phone, it's **Settings** inside the menu.

**Where do I manage my team members?** Under **Settings › Team & permissions**, or with **Invite people** at the bottom of the sidebar. **Performance**, in the sidebar, shows how each person sells and collects.

**I can't find the collections AI agent.** Open **Collections** in the sidebar: the agent shows up right below it. You can also type "agent" in search.

**My pinned pages don't show up in another organization.** That's on purpose: they're saved per workspace. Each organization has its own.

**The bell flags something I already saw on my phone.** It shouldn't: what you've read is saved to your account. Reload the page; if it keeps happening, write to us.
