// BottleNote Magazine - Figma Plugin
// This file runs in Figma's sandbox. No Node.js imports.
figma.showUI(__html__, { width: 400, height: 600 });
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'populate-template') {
        if (!msg.cards)
            return;
        await populateTemplate(msg.cards);
    }
};
async function populateTemplate(cards) {
    const page = figma.currentPage;
    // Check if user has selected a frame to use as reference position
    const selection = figma.currentPage.selection;
    let selectedFrame = null;
    if (selection.length > 0 && selection[0].type === 'FRAME') {
        selectedFrame = selection[0];
    }
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        let templateName;
        if (card.type === 'cover')
            templateName = 'Template-Cover';
        else if (card.type === 'closing')
            templateName = 'Template-Closing';
        else
            templateName = 'Template-Content';
        // Find template frame
        const template = page.findOne((n) => n.name === templateName && n.type === 'FRAME');
        if (!template) {
            figma.notify(`템플릿 "${templateName}"을 찾을 수 없습니다`);
            continue;
        }
        // Clone template
        const clone = template.clone();
        clone.name = `Card-${i + 1}-${card.type}`;
        // Position based on selected frame or template
        if (selectedFrame) {
            // Place cards to the right of the selected frame
            clone.x = selectedFrame.x + selectedFrame.width + 40 + i * (template.width + 40);
            clone.y = selectedFrame.y;
        }
        else {
            // Default: place cards to the right of the template
            clone.x = template.x + (i + 1) * (template.width + 40);
        }
        // Replace text nodes
        const textNodes = clone.findAll((n) => n.type === 'TEXT');
        for (const textNode of textNodes) {
            if (textNode.name === 'title' || textNode.name === 'heading') {
                await figma.loadFontAsync(textNode.fontName);
                textNode.characters = card.heading || '';
            }
            if (textNode.name === 'subtitle' || textNode.name === 'body') {
                await figma.loadFontAsync(textNode.fontName);
                textNode.characters = card.body || '';
            }
            if (textNode.name === 'image-ref') {
                await figma.loadFontAsync(textNode.fontName);
                textNode.characters = card.imageRef || '';
            }
            // Handle tag-1, tag-2, tag-3
            if (textNode.name.startsWith('tag-')) {
                const tagIndex = parseInt(textNode.name.replace('tag-', ''), 10) - 1;
                await figma.loadFontAsync(textNode.fontName);
                textNode.characters = card.tags?.[tagIndex] || '';
            }
        }
        // Handle tags container visibility
        const tagsContainer = clone.findOne((n) => n.name === 'tags');
        if (tagsContainer) {
            // Hide container if no tags
            if (!card.tags || card.tags.length === 0) {
                tagsContainer.visible = false;
            }
        }
        // If imageRef exists but no image-ref text node found, create a note
        if (card.imageRef) {
            const hasRefNode = textNodes.some((n) => n.name === 'image-ref');
            if (!hasRefNode) {
                const refText = figma.createText();
                await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
                refText.fontName = { family: 'Inter', style: 'Regular' };
                refText.name = 'image-ref';
                refText.characters = card.imageRef;
                refText.fontSize = 10;
                refText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
                refText.x = 16;
                refText.y = clone.height - 24;
                clone.appendChild(refText);
            }
        }
    }
    figma.notify('매거진 카드가 생성되었습니다!');
    figma.ui.postMessage({ type: 'populate-complete' });
}
