# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - banner [ref=e4]
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "Welcome Back!" [level=1] [ref=e7]
        - paragraph [ref=e8]: Enter your login data.
      - generic [ref=e9]:
        - generic [ref=e10]:
          - generic [ref=e11]: Login Name
          - textbox "Login Name" [active] [ref=e13]:
            - /placeholder: username@domain
        - generic [ref=e14]:
          - link "" [ref=e15] [cursor=pointer]:
            - /url: "#"
            - generic [ref=e16]: 
          - button "Next" [disabled] [ref=e17]
  - contentinfo [ref=e18]:
    - generic [ref=e20]: Powered By
```