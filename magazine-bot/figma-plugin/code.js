// figma-plugin/code.ts
figma.showUI(__html__, { width: 400, height: 600 });
figma.ui.onmessage = async (msg) => {
  if (msg.type === "populate-template") {
    if (!msg.cards) return;
    await populateTemplate(msg.cards);
  }
};
async function populateTemplate(cards) {
  const page = figma.currentPage;
  const selection = figma.currentPage.selection;
  let selectedFrame = null;
  if (selection.length > 0 && selection[0].type === "FRAME") {
    selectedFrame = selection[0];
  }
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    let templateName;
    if (card.type === "cover") templateName = "Template-Cover";
    else if (card.type === "closing") templateName = "Template-Closing";
    else templateName = "Template-Content";
    const template = page.findOne(
      (n) => n.name === templateName && n.type === "FRAME"
    );
    if (!template) {
      figma.notify(`\uD15C\uD50C\uB9BF "${templateName}"\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4`);
      continue;
    }
    const clone = template.clone();
    clone.name = `Card-${i + 1}-${card.type}`;
    if (selectedFrame) {
      clone.x = selectedFrame.x + selectedFrame.width + 40 + i * (template.width + 40);
      clone.y = selectedFrame.y;
    } else {
      clone.x = template.x + (i + 1) * (template.width + 40);
    }
    const textNodes = clone.findAll((n) => n.type === "TEXT");
    for (const textNode of textNodes) {
      if (textNode.name === "title" || textNode.name === "heading") {
        await figma.loadFontAsync(textNode.fontName);
        textNode.characters = card.heading || "";
      }
      if (textNode.name === "subtitle" || textNode.name === "body") {
        await figma.loadFontAsync(textNode.fontName);
        textNode.characters = card.body || "";
      }
      if (textNode.name === "image-ref") {
        await figma.loadFontAsync(textNode.fontName);
        textNode.characters = card.imageRef || "";
      }
    }
    if (card.imageRef) {
      const hasRefNode = textNodes.some((n) => n.name === "image-ref");
      if (!hasRefNode) {
        const refText = figma.createText();
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        refText.fontName = { family: "Inter", style: "Regular" };
        refText.name = "image-ref";
        refText.characters = card.imageRef;
        refText.fontSize = 10;
        refText.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.6 } }];
        refText.x = 16;
        refText.y = clone.height - 24;
        clone.appendChild(refText);
      }
    }
  }
  figma.notify("\uB9E4\uAC70\uC9C4 \uCE74\uB4DC\uAC00 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4!");
  figma.ui.postMessage({ type: "populate-complete" });
}
