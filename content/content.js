

// ensure the properties are up to date
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "updateTheme") {
    document.documentElement.style.setProperty(
      message.name,
      message.value
    );
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getTheme") {
    const styles = getComputedStyle(document.documentElement);

    const values = {};

    for (const name of message.names) {
      values[name] = styles.getPropertyValue(name).trim();
    }

    sendResponse(values);
  }

  if (message.type === "updateTheme") {
    document.documentElement.style.setProperty(
      message.name,
      message.value
    );
  }
});