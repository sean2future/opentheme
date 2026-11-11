class ColorRow extends HTMLElement {
    connectedCallback() {
        const label = this.getAttribute("label");
        const value = this.getAttribute("value");
        const id = this.getAttribute("id")

        this.innerHTML = `
            <div class="row">
                <label class="row-label">${label}</label>
                <input type="text" class="color-input" data-coloris value="${value}" id="${id}">
            </div>
        `;
    }
}

customElements.define("color-row", ColorRow);