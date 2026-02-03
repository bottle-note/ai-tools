// BottleNote Magazine - Figma Plugin
// This file runs in Figma's sandbox. No Node.js imports.

figma.showUI(__html__, { width: 400, height: 600 });

interface CardData {
  type: 'cover' | 'content' | 'closing';
  heading: string;
  body: string;
  imageUrl: string | null;
}

figma.ui.onmessage = async (msg: { type: string; cards?: CardData[] }) => {
  if (msg.type === 'populate-template') {
    if (!msg.cards) return;
    await populateTemplate(msg.cards);
  }
};

async function populateTemplate(cards: CardData[]) {
  const page = figma.currentPage;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    let templateName: string;

    if (card.type === 'cover') templateName = 'Template-Cover';
    else if (card.type === 'closing') templateName = 'Template-Closing';
    else templateName = 'Template-Content';

    // Find template frame
    const template = page.findOne(
      (n) => n.name === templateName && n.type === 'FRAME',
    ) as FrameNode | null;

    if (!template) {
      figma.notify(`템플릿 "${templateName}"을 찾을 수 없습니다`);
      continue;
    }

    // Clone template
    const clone = template.clone();
    clone.name = `Card-${i + 1}-${card.type}`;
    clone.x = template.x + (i + 1) * (template.width + 40);

    // Replace text nodes
    const textNodes = clone.findAll((n) => n.type === 'TEXT') as TextNode[];
    for (const textNode of textNodes) {
      if (textNode.name === 'title' || textNode.name === 'heading') {
        await figma.loadFontAsync(textNode.fontName as FontName);
        textNode.characters = card.heading || '';
      }
      if (textNode.name === 'subtitle' || textNode.name === 'body') {
        await figma.loadFontAsync(textNode.fontName as FontName);
        textNode.characters = card.body || '';
      }
    }

    // Replace image fill
    if (card.imageUrl) {
      const imageNode = clone.findOne((n) => n.name === 'bg-image') as
        | RectangleNode
        | FrameNode
        | null;

      if (imageNode && 'fills' in imageNode) {
        try {
          const imageData = await figma.createImageAsync(card.imageUrl);
          imageNode.fills = [
            {
              type: 'IMAGE',
              imageHash: imageData.hash,
              scaleMode: 'FILL',
            },
          ];
        } catch (e) {
          figma.notify(`이미지 로드 실패: Card ${i + 1}`);
        }
      }
    }
  }

  figma.notify('매거진 카드가 생성되었습니다!');
  figma.ui.postMessage({ type: 'populate-complete' });
}
