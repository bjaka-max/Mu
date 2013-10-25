{
  "name": "Willy",
  "wrapped": function() {
    return function(text) {
      return "<b>" + render(text) + "</b>"
    }
  }
}