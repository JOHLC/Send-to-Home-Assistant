## Automation examples

#### Send the link to your phone

```yaml
alias: Send to Home Assistant
description: ""
triggers:
  - trigger: webhook
    allowed_methods:
      - POST
      - PUT
      - GET
    local_only: false
    webhook_id: !your_webook_id_change_this!
conditions: []
actions:
  - data:
      title: Send to Home Assistant
      message: |
        Title: {{ trigger.json.title }}
        {{ trigger.json.selected or '' }} 
        Url: {{ trigger.json.url }}
      data:
        url: "{{ trigger.json.url }}"
        clickAction: "{{ trigger.json.url }}"
        icon_url: "{{ trigger.json.favicon }}"
        tag: "{{ trigger.json.url }}"
        importance: high
        ttl: 0
        priority: high
        channel: Send to Home Assistant
        subtitle: |
          Shared: {{ trigger.json.title }}
        actions:
          - action: URI
            title: Open Link
            uri: "{{ trigger.json.url }}"
    action: notify.mobile_app_persons_phone
mode: single


```
