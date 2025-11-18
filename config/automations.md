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

#### Route actions based on context menu selection

The extension sends a `context` field when triggered from a context menu item. You can use this to route different actions based on which context menu option was used.

```yaml
alias: Send to Home Assistant - Contextual Routing
description: Route different actions based on context menu selection
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
  - choose:
      # Handle "Read Later" context
      - conditions:
          - condition: template
            value_template: "{{ trigger.json.context == 'Read Later' }}"
        sequence:
          - action: todo.add_item
            target:
              entity_id: todo.reading_list
            data:
              item: "{{ trigger.json.title }}"
              description: "{{ trigger.json.url }}"
      
      # Handle "Share with Family" context
      - conditions:
          - condition: template
            value_template: "{{ trigger.json.context == 'Share with Family' }}"
        sequence:
          - action: notify.family_group
            data:
              title: "{{ trigger.json.title }}"
              message: "{{ trigger.json.url }}"
              data:
                url: "{{ trigger.json.url }}"
                clickAction: "{{ trigger.json.url }}"
      
      # Handle "Save to Notes" context
      - conditions:
          - condition: template
            value_template: "{{ trigger.json.context == 'Save to Notes' }}"
        sequence:
          - action: notify.persistent_notification
            data:
              title: "Saved: {{ trigger.json.title }}"
              message: |
                {{ trigger.json.selected or trigger.json.url }}
    
    # Default action when no context matches or when triggered from extension icon
    default:
      - action: notify.mobile_app_your_phone
        data:
          title: "{{ trigger.json.title }}"
          message: "{{ trigger.json.url }}"
          data:
            url: "{{ trigger.json.url }}"
            clickAction: "{{ trigger.json.url }}"
mode: single
```

**Note:** The `context` field is only present when the extension is triggered via a context menu item (right-click). When triggered via the extension icon click, the `context` field will not be present in the payload.
