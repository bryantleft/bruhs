import SwiftUI

/// Wraps two items without duplicating stateful pickers in ViewThatFits alternatives.
struct ChartRowLayout: Layout {
    var horizontalSpacing: CGFloat = 8
    var verticalSpacing: CGFloat = 8
    var spreads = false

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let available = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil }
        guard !subviews.isEmpty else { return .zero }
        if subviews.count == 1 { return subviews[0].sizeThatFits(ProposedViewSize(width: available, height: nil)) }
        let measured = measure(subviews, width: available)
        let width = measured.wraps
            ? max(measured.first.width, measured.second.width)
            : measured.first.width + horizontalSpacing + measured.second.width
        let height = measured.wraps
            ? measured.first.height + verticalSpacing + measured.second.height
            : measured.baseline + max(measured.first.height - measured.first[.firstTextBaseline],
                                      measured.second.height - measured.second[.firstTextBaseline])
        return CGSize(width: spreads ? max(width, available ?? width) : width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard !subviews.isEmpty else { return }
        if subviews.count == 1 {
            subviews[0].place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
            return
        }
        let measured = measure(subviews, width: bounds.width)
        let first = measured.first, second = measured.second
        let firstY = measured.wraps ? bounds.minY : bounds.minY + measured.baseline - first[.firstTextBaseline]
        let secondY = measured.wraps
            ? bounds.minY + first.height + verticalSpacing
            : bounds.minY + measured.baseline - second[.firstTextBaseline]
        let secondX = measured.wraps ? bounds.minX : spreads ? bounds.maxX - second.width : bounds.minX + first.width + horizontalSpacing
        subviews[0].place(at: CGPoint(x: bounds.minX, y: firstY), anchor: .topLeading,
                          proposal: ProposedViewSize(width: first.width, height: first.height))
        subviews[1].place(at: CGPoint(x: secondX, y: secondY), anchor: .topLeading,
                          proposal: ProposedViewSize(width: second.width, height: second.height))
    }

    private func measure(_ subviews: Subviews, width: CGFloat?) -> (first: ViewDimensions, second: ViewDimensions, wraps: Bool, baseline: CGFloat) {
        precondition(subviews.count == 2, "ChartRowLayout requires exactly two items.")
        let proposal = ProposedViewSize(width: width, height: nil)
        let first = subviews[0].dimensions(in: proposal), second = subviews[1].dimensions(in: proposal)
        return (first, second, first.width + horizontalSpacing + second.width > (width ?? .infinity),
                max(first[.firstTextBaseline], second[.firstTextBaseline]))
    }
}
