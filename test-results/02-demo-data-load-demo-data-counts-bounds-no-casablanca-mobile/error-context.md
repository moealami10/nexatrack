# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-demo-data.spec.ts >> load demo data: counts, bounds, no casablanca
- Location: e2e/02-demo-data.spec.ts:4:1

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - banner [ref=e5]:
        - generic [ref=e6]: Dashboard
        - generic [ref=e8]:
          - generic [ref=e9]:
            - button "Nothing to undo (Ctrl+Z)" [disabled] [ref=e11]
            - button "Nothing to redo (Ctrl+Shift+Z)" [disabled] [ref=e16]
          - group "Language" [ref=e20]:
            - button "Switch to English" [pressed] [ref=e21]: EN
            - button "Passer en français" [ref=e22]: FR
      - main [ref=e23]:
        - generic [ref=e25]:
          - heading "Dashboard" [level=1] [ref=e26]
          - paragraph [ref=e27]: Overview of your delivery operations in Laayoune.
        - generic [ref=e28]:
          - generic [ref=e29]:
            - generic [ref=e30]:
              - generic [ref=e31]: 🧾
              - generic [ref=e32]: Orders today
            - paragraph [ref=e33]: "0"
          - generic [ref=e34]:
            - generic [ref=e35]:
              - generic [ref=e36]: ✅
              - generic [ref=e37]: Delivered
            - paragraph [ref=e38]: 0%
            - paragraph [ref=e39]: 0 of 0 orders
          - generic [ref=e40]:
            - generic [ref=e41]:
              - generic [ref=e42]: 🛵
              - generic [ref=e43]: Active drivers
            - paragraph [ref=e44]: "0"
            - paragraph [ref=e45]: 0 available
          - generic [ref=e46]:
            - generic [ref=e47]:
              - generic [ref=e48]: ⚠️
              - generic [ref=e49]: Low stock
            - paragraph [ref=e50]: "0"
            - paragraph [ref=e51]: At or below threshold — check Inventory
        - generic [ref=e52]:
          - heading "Getting started" [level=2] [ref=e53]
          - list [ref=e54]:
            - listitem [ref=e55]:
              - generic [aria-hidden] [ref=e56]: "1"
              - link "Add products" [ref=e57] [cursor=pointer]:
                - /url: /nexatrack/products
            - listitem [ref=e58]:
              - generic [aria-hidden] [ref=e59]: "2"
              - link "Set stock" [ref=e60] [cursor=pointer]:
                - /url: /nexatrack/inventory
            - listitem [ref=e61]:
              - generic [aria-hidden] [ref=e62]: "3"
              - link "Add drivers" [ref=e63] [cursor=pointer]:
                - /url: /nexatrack/drivers
            - listitem [ref=e64]:
              - generic [aria-hidden] [ref=e65]: "4"
              - link "Create orders" [ref=e66] [cursor=pointer]:
                - /url: /nexatrack/orders
            - listitem [ref=e67]:
              - generic [aria-hidden] [ref=e68]: "5"
              - link "Plan routes" [ref=e69] [cursor=pointer]:
                - /url: /nexatrack/routes
        - generic [ref=e70]:
          - generic [ref=e71]:
            - heading "Orders by status" [level=2] [ref=e72]
            - application [ref=e76]:
              - generic [ref=e80]:
                - generic [ref=e81]:
                  - generic [ref=e82]: Pending
                  - generic [ref=e84]: Assigned
                  - generic [ref=e86]: In transit
                  - generic [ref=e88]: Delivered
                  - generic [ref=e90]: Failed
                  - generic [ref=e92]: Cancelled
                - generic [ref=e94]:
                  - generic [ref=e95]: "0"
                  - generic [ref=e97]: "1"
                  - generic [ref=e99]: "2"
                  - generic [ref=e101]: "3"
                  - generic [ref=e103]: "4"
          - generic [ref=e105]:
            - generic [ref=e106]:
              - heading "Latest orders" [level=2] [ref=e107]
              - link "View all →" [ref=e108] [cursor=pointer]:
                - /url: /nexatrack/orders
            - generic [ref=e109]:
              - generic [ref=e110]: 🧾
              - paragraph [ref=e111]: No orders yet.
    - navigation "Menu" [ref=e112]:
      - link "Dashboard" [ref=e113] [cursor=pointer]:
        - /url: /nexatrack/dashboard
        - generic [aria-hidden] [ref=e114]: 📊
      - link "Orders" [ref=e116] [cursor=pointer]:
        - /url: /nexatrack/orders
        - generic [aria-hidden] [ref=e117]: 🧾
      - link "Drivers" [ref=e119] [cursor=pointer]:
        - /url: /nexatrack/drivers
        - generic [aria-hidden] [ref=e120]: 🛵
      - link "Routes" [ref=e122] [cursor=pointer]:
        - /url: /nexatrack/routes
        - generic [aria-hidden] [ref=e123]: 🗺️
      - button "More" [active] [ref=e125]:
        - generic [aria-hidden] [ref=e126]: ⋯
    - dialog "More" [ref=e129]:
      - generic [ref=e130]:
        - heading "More" [level=2] [ref=e131]
        - button "Close" [ref=e132]: ✕
      - navigation [ref=e133]:
        - link "Products" [ref=e134] [cursor=pointer]:
          - /url: /nexatrack/products
          - generic [aria-hidden] [ref=e135]: 📦
          - text: Products
        - link "Inventory" [ref=e136] [cursor=pointer]:
          - /url: /nexatrack/inventory
          - generic [aria-hidden] [ref=e137]: 🗃️
          - text: Inventory
        - link "Settings" [ref=e138] [cursor=pointer]:
          - /url: /nexatrack/settings
          - generic [aria-hidden] [ref=e139]: ⚙️
          - text: Settings
        - generic [ref=e140]:
          - generic [ref=e141]: Language
          - group "Language" [ref=e142]:
            - button "Switch to English" [pressed] [ref=e143]: EN
            - button "Passer en français" [ref=e144]: FR
      - generic [ref=e145]:
        - button "📥 Load demo data" [ref=e146]
        - button "🗑️ Clear all data" [ref=e147]
  - generic [aria-hidden] [ref=e148]: "0"
```